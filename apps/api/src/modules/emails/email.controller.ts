import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../../db/prisma.js";
import {
  parseEmailsFromText,
  calculateScheduleTimes,
  assignSendersRoundRobin,
  ScheduleEmailFormSchema,
  EmailFilterSchema,
} from "@reachinbox/shared";
import { emailSendQueue } from "../../queues/email.queue.js";
import { elasticsearchService } from "../../services/elasticsearch/elasticsearch.service.js";
import { smtpService } from "../../services/smtp/smtp.service.js";

export class EmailController {
  /**
   * Schedules a campaign with delayed BullMQ jobs
   */
  public static async scheduleEmails(
    req: Request,
    res: Response,
  ): Promise<void> {
    const userId = req.user!.id;
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    // Idempotency check (Section 65)
    if (idempotencyKey) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key: `${userId}:${idempotencyKey}` },
      });
      if (existing) {
        res.json({
          success: true,
          data: existing.response,
          _idempotentReplay: true,
        });
        return;
      }
    }

    // 1. Validate form fields
    const validation = ScheduleEmailFormSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid form inputs",
          details: validation.error.format(),
        },
      });
      return;
    }

    const { subject, body, startTime, delayMs, hourlyLimit } = validation.data;

    // 2. Validate file upload
    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        success: false,
        error: {
          code: "FILE_REQUIRED",
          message: "A CSV or TXT file containing email addresses is required",
        },
      });
      return;
    }

    // 3. Parse and extract emails from file
    const fileContent = req.file.buffer.toString("utf8");
    const parseResult = parseEmailsFromText(fileContent);

    if (parseResult.validEmails.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: "NO_VALID_EMAILS",
          message:
            "No valid recipient email addresses detected in the uploaded file",
        },
      });
      return;
    }

    // 4. Retrieve active senders
    await smtpService.ensureSendersSeeded();
    const senders = await smtpService.getActiveSenders();

    if (senders.length === 0) {
      res.status(500).json({
        success: false,
        error: {
          code: "NO_SENDERS_AVAILABLE",
          message: "No active sender identities configured in the system",
        },
      });
      return;
    }

    const senderIds = senders.map((s) => s.id);
    const validEmails = parseResult.validEmails;
    const emailCount = validEmails.length;

    // 5. Calculate scheduled times and deterministic sender assignments
    const parsedStartTime = new Date(startTime);
    const scheduleTimes = calculateScheduleTimes(
      parsedStartTime,
      emailCount,
      delayMs,
    );
    const senderAssignments = assignSendersRoundRobin(emailCount, senderIds);

    // 6. Execute Database Transaction: Create Campaign & EmailMessage rows
    const campaignId = crypto.randomUUID();
    const now = new Date();

    const emailMessagesData = validEmails.map((recipient, i) => {
      const messageId = crypto.randomUUID();
      const scheduledAt = scheduleTimes[i];
      const senderId = senderAssignments[i];
      const deterministicMessageId = `<email-message-${messageId}@reachinbox.local>`;
      const queueJobId = `email-${messageId}`;

      return {
        id: messageId,
        campaignId,
        userId,
        senderId,
        recipient,
        subject,
        body,
        sequenceNumber: i,
        scheduledAt,
        status: "scheduled",
        deterministicMessageId,
        queueJobId,
        createdAt: now,
        updatedAt: now,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.campaign.create({
        data: {
          id: campaignId,
          userId,
          subject,
          body,
          startAt: parsedStartTime,
          delayMs,
          hourlyLimit,
        },
      });

      await tx.emailMessage.createMany({
        data: emailMessagesData,
      });
    });

    // 7. Enqueue BullMQ delayed jobs deterministically
    const bulkJobData = emailMessagesData.map((msg) => {
      const delay = Math.max(0, msg.scheduledAt.getTime() - Date.now());
      return {
        name: "send-email",
        data: {
          emailMessageId: msg.id,
          campaignId: msg.campaignId,
          senderId: msg.senderId,
          userId: msg.userId,
          sequenceNumber: msg.sequenceNumber,
          scheduledAt: msg.scheduledAt.toISOString(),
        },
        opts: {
          jobId: msg.queueJobId,
          delay,
        },
      };
    });

    await emailSendQueue.addBulk(bulkJobData);

    // 8. Bulk index in Elasticsearch
    const esDocs = emailMessagesData.map((msg) => ({
      id: msg.id,
      userId: msg.userId,
      campaignId: msg.campaignId,
      senderId: msg.senderId,
      recipient: msg.recipient,
      subject: msg.subject,
      body: msg.body,
      status: msg.status,
      sequenceNumber: msg.sequenceNumber,
      scheduledAt: msg.scheduledAt.toISOString(),
      sentAt: null,
      failedAt: null,
      failureReason: null,
      createdAt: msg.createdAt.toISOString(),
      updatedAt: msg.updatedAt.toISOString(),
    }));

    elasticsearchService.bulkIndexEmails(esDocs).catch((err) => {
      console.warn(
        "[ES ASYNC WARN] Background bulk index failed:",
        err.message,
      );
    });

    const responsePayload = {
      campaignId,
      totalDetected: parseResult.totalDetected,
      scheduledCount: emailCount,
      skippedDuplicates: parseResult.duplicateCount,
      skippedInvalid: parseResult.invalidCount,
      startTime: parsedStartTime.toISOString(),
      delayMs,
      hourlyLimit,
    };

    // Store idempotency record if requested
    if (idempotencyKey) {
      await prisma.idempotencyKey
        .create({
          data: {
            key: `${userId}:${idempotencyKey}`,
            userId,
            response: responsePayload,
          },
        })
        .catch(() => {});
    }

    console.log(
      `[CAMPAIGN_SCHEDULED] User ${userId} scheduled campaign ${campaignId} with ${emailCount} emails. First send at ${scheduleTimes[0]?.toISOString()}`,
    );

    res.status(201).json({
      success: true,
      data: responsePayload,
    });
  }

  /**
   * Retrieves paginated list of emails for current user
   */
  public static async listEmails(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;

    const parsedQuery = EmailFilterSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_QUERY", message: "Invalid query parameters" },
      });
      return;
    }

    const { status, page, pageSize, search } = parsedQuery.data;
    const skip = (page - 1) * pageSize;

    const whereClause: any = { userId };

    if (status) {
      whereClause.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      whereClause.OR = [
        { recipient: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy: any =
      status === "sent"
        ? [{ sentAt: "desc" }, { createdAt: "desc" }]
        : [{ scheduledAt: "asc" }, { sequenceNumber: "asc" }];

    const [items, total] = await Promise.all([
      prisma.emailMessage.findMany({
        where: whereClause,
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.emailMessage.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    res.json({
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages,
      },
    });
  }

  /**
   * Retrieves single email message by ID
   */
  public static async getEmailById(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const { id } = req.params;

    const email = await prisma.emailMessage.findFirst({
      where: { id, userId },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        campaign: true,
      },
    });

    if (!email) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Email not found" },
      });
      return;
    }

    res.json({
      success: true,
      data: email,
    });
  }

  /**
   * Cancels a scheduled email
   */
  public static async cancelEmail(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const { id } = req.params;

    const email = await prisma.emailMessage.findFirst({
      where: { id, userId, status: "scheduled" },
    });

    if (!email) {
      res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND_OR_NOT_SCHEDULED",
          message: "Scheduled email not found or cannot be cancelled",
        },
      });
      return;
    }

    // Update DB
    await prisma.emailMessage.update({
      where: { id },
      data: { status: "cancelled" },
    });

    // Remove job from BullMQ
    try {
      const job = await emailSendQueue.getJob(email.queueJobId);
      if (job) {
        await job.remove();
      }
    } catch (err: any) {
      console.warn(
        "[BULLMQ WARN] Failed to remove cancelled job from queue:",
        err.message,
      );
    }

    res.json({
      success: true,
      message: "Email successfully cancelled",
    });
  }
}
