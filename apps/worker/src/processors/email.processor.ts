import { Job, DelayedError } from "bullmq";
import { QueueEmailSendPayload } from "@reachinbox/shared";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { getRedisClient } from "../queues/redis.js";
import { DistributedRateLimiter } from "../services/rate-limiter/redis-rate-limiter.js";
import { workerSmtpService } from "../services/smtp/smtp.service.js";
import { workerSlackService } from "../services/slack/slack.service.js";
import { workerElasticsearchService } from "../services/elasticsearch/elasticsearch.service.js";

const rateLimiter = new DistributedRateLimiter(getRedisClient());

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processEmailSendJob(
  job: Job<QueueEmailSendPayload>,
  token?: string,
): Promise<{ success: boolean; previewUrl?: string | null }> {
  const { emailMessageId, senderId, userId, campaignId } = job.data;

  console.log(
    `[EMAIL_JOB_STARTED] Job ${job.id} for message ${emailMessageId} (sender: ${senderId})`,
  );

  // 1. Load authoritative EmailMessage from PostgreSQL
  const emailMessage = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
    include: { sender: true },
  });

  if (!emailMessage) {
    console.warn(
      `[WARN] EmailMessage ${emailMessageId} not found in database. Skipping.`,
    );
    return { success: false };
  }

  // 2. IDEMPOTENCY GUARD: If already sent, return immediately without sending
  if (emailMessage.status === "sent") {
    console.log(
      `[IDEMPOTENT_SKIP] Message ${emailMessageId} is already marked as sent. Skipping SMTP send.`,
    );
    return { success: true, previewUrl: emailMessage.previewUrl };
  }

  // 3. Atomically transition to 'sending' with processing lease
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 60000); // 60s lease

  const transitionResult = await prisma.emailMessage.updateMany({
    where: {
      id: emailMessageId,
      OR: [
        { status: "scheduled" },
        // Allow retry if previously sending but lease expired
        { status: "sending", processingLeaseUntil: { lt: now } },
        { status: "failed" },
      ],
    },
    data: {
      status: "sending",
      processingStartedAt: now,
      processingLeaseUntil: leaseUntil,
    },
  });

  if (transitionResult.count === 0) {
    // Another concurrent worker is actively processing this message under lease
    console.log(
      `[LEASE_ACTIVE] Message ${emailMessageId} is actively leased by another process. Skipping.`,
    );
    return { success: false };
  }

  // 4. ATOMIC DISTRIBUTED RATE LIMITER (Redis Lua Script)
  const minDelayMs = env.MIN_SEND_DELAY_MS;
  const hourlyLimit = env.MAX_EMAILS_PER_HOUR_PER_SENDER;

  const rateCheck = await rateLimiter.reserveSendSlot(
    senderId,
    minDelayMs,
    hourlyLimit,
  );

  // If hourly limit is reached, reschedule job to next hour window
  if (!rateCheck.allowed) {
    const retryAtMs = rateCheck.retryAtMs || Date.now() + 3600000;
    const delay = Math.max(1000, retryAtMs - Date.now());
    const nextScheduledAt = new Date(retryAtMs);

    console.log(
      `[EMAIL_RATE_LIMITED] Sender ${senderId} hourly capacity full (${rateCheck.currentCount}/${hourlyLimit}). Rescheduling message ${emailMessageId} to ${nextScheduledAt.toISOString()} (delay: ${delay}ms)`,
    );

    // Revert DB state back to scheduled with new scheduledAt
    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: {
        status: "scheduled",
        scheduledAt: nextScheduledAt,
        processingStartedAt: null,
        processingLeaseUntil: null,
      },
    });

    // Send Slack rate limit alert once per sender per hour window
    const shouldNotify = await rateLimiter.shouldNotifySlack(
      senderId,
      rateCheck.hourWindow,
    );
    if (shouldNotify) {
      await workerSlackService.sendRateLimitAlert(userId, {
        senderEmail: emailMessage.sender?.email || senderId,
        hourlyLimit,
        hourWindow: rateCheck.hourWindow,
      });
    }

    // Reschedule this exact BullMQ job to next window using BullMQ moveToDelayed
    if (token) {
      await job.moveToDelayed(Date.now() + delay, token);
      throw new DelayedError();
    } else {
      // Fallback if token not passed
      await sleep(1000);
      throw new Error(
        `Rate limit reached for sender ${senderId}. Rescheduled.`,
      );
    }
  }

  // If rate limiter reserved a slot with spacing in the future, wait the exact minimum spacing
  const waitMs = rateCheck.scheduledSendAtMs - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  // 5. SEND EMAIL VIA ETHEREAL SMTP
  const sendResult = await workerSmtpService.sendEmail({
    emailMessageId: emailMessage.id,
    senderId: emailMessage.senderId,
    recipient: emailMessage.recipient,
    subject: emailMessage.subject,
    body: emailMessage.body,
  });

  if (sendResult.success) {
    const sentAt = new Date();

    // 6. DB STATE TRANSITION: sending -> sent
    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: {
        status: "sent",
        sentAt,
        previewUrl: sendResult.previewUrl,
        attemptCount: job.attemptsMade + 1,
        processingStartedAt: null,
        processingLeaseUntil: null,
      },
    });

    console.log(
      `[EMAIL_SENT] Successfully sent message ${emailMessageId} to ${emailMessage.recipient}. Preview: ${sendResult.previewUrl || "none"}`,
    );

    // 7. Update Elasticsearch
    await workerElasticsearchService.updateEmailStatus(emailMessageId, "sent", {
      sentAt: sentAt.toISOString(),
    });

    return { success: true, previewUrl: sendResult.previewUrl };
  } else {
    // 8. Handle SMTP failure
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 5);
    const failureReason = sendResult.error || "Unknown SMTP error";

    if (isFinalAttempt) {
      const failedAt = new Date();
      await prisma.emailMessage.update({
        where: { id: emailMessageId },
        data: {
          status: "failed",
          failedAt,
          failureReason,
          attemptCount: job.attemptsMade + 1,
          processingStartedAt: null,
          processingLeaseUntil: null,
        },
      });

      console.error(
        `[EMAIL_FAILED] Final failure for message ${emailMessageId}: ${failureReason}`,
      );

      await workerElasticsearchService.updateEmailStatus(
        emailMessageId,
        "failed",
        {
          failedAt: failedAt.toISOString(),
          failureReason,
        },
      );
    }

    // Throw error so BullMQ triggers exponential backoff retry if attempts remain
    throw new Error(failureReason);
  }
}
