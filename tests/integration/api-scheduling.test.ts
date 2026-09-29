import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../apps/api/src/db/prisma.js";
import { emailSendQueue } from "../../apps/api/src/queues/email.queue.js";
import { smtpService } from "../../apps/api/src/services/smtp/smtp.service.js";
import {
  calculateScheduleTimes,
  assignSendersRoundRobin,
  parseEmailsFromText,
} from "@reachinbox/shared";

describe("Integration Tests: Scheduling API & Database Persistence", () => {
  let testUserId: string;
  let senderIds: string[];

  beforeAll(async () => {
    // 1. Ensure senders exist
    await smtpService.ensureSendersSeeded();
    const senders = await smtpService.getActiveSenders();
    senderIds = senders.map((s) => s.id);

    // 2. Create test user
    const user = await prisma.user.upsert({
      where: { email: "integration.tester@reachinbox.local" },
      update: {},
      create: {
        email: "integration.tester@reachinbox.local",
        name: "Integration Tester",
        googleId: "test-google-int-123",
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.emailMessage.deleteMany({ where: { userId: testUserId } });
    await prisma.campaign.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it("persists campaign and scheduled EmailMessage rows into PostgreSQL with deterministic queue jobs", async () => {
    const rawCsv = `name,email
Alice,alice@example.com
Bob,bob@example.com
Charlie,charlie@example.com`;

    const parsed = parseEmailsFromText(rawCsv);
    expect(parsed.validEmails).toHaveLength(3);

    const startTime = new Date(Date.now() + 60000); // 1 minute in future
    const delayMs = 3000;
    const scheduleTimes = calculateScheduleTimes(
      startTime,
      parsed.validEmails.length,
      delayMs,
    );
    const assignedSenders = assignSendersRoundRobin(
      parsed.validEmails.length,
      senderIds,
    );

    const campaignId = `test-camp-${Date.now()}`;

    // Insert Campaign & Messages
    const emailData = parsed.validEmails.map((recipient, i) => {
      const id = `test-msg-${Date.now()}-${i}`;
      return {
        id,
        campaignId,
        userId: testUserId,
        senderId: assignedSenders[i],
        recipient,
        subject: "Integration Test Subject",
        body: "Integration Test Body",
        sequenceNumber: i,
        scheduledAt: scheduleTimes[i],
        status: "scheduled",
        deterministicMessageId: `<email-message-${id}@reachinbox.local>`,
        queueJobId: `email-${id}`,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.campaign.create({
        data: {
          id: campaignId,
          userId: testUserId,
          subject: "Integration Test Subject",
          body: "Integration Test Body",
          startAt: startTime,
          delayMs,
          hourlyLimit: 100,
        },
      });
      await tx.emailMessage.createMany({ data: emailData });
    });

    // Enqueue jobs into BullMQ
    const bulkJobs = emailData.map((msg) => ({
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
        delay: Math.max(0, msg.scheduledAt.getTime() - Date.now()),
      },
    }));

    await emailSendQueue.addBulk(bulkJobs);

    // Verify in PostgreSQL
    const savedMessages = await prisma.emailMessage.findMany({
      where: { campaignId },
      orderBy: { sequenceNumber: "asc" },
    });

    expect(savedMessages).toHaveLength(3);
    expect(savedMessages[0].recipient).toBe("alice@example.com");
    expect(savedMessages[0].status).toBe("scheduled");
    expect(savedMessages[1].recipient).toBe("bob@example.com");
    expect(savedMessages[2].recipient).toBe("charlie@example.com");

    // Verify in BullMQ
    for (const msg of savedMessages) {
      const job = await emailSendQueue.getJob(msg.queueJobId);
      expect(job).toBeDefined();
      expect(job?.id).toBe(msg.queueJobId);
      expect(job?.data.emailMessageId).toBe(msg.id);

      // Clean up BullMQ job
      await job?.remove();
    }
  });

  it("prevents duplicate job IDs in BullMQ without throwing uncaught exceptions", async () => {
    const fixedId = `test-idempotent-${Date.now()}`;
    const jobId = `email-${fixedId}`;

    const job1 = await emailSendQueue.add(
      "send-email",
      {
        emailMessageId: fixedId,
        campaignId: "c1",
        senderId: senderIds[0],
        userId: testUserId,
        sequenceNumber: 0,
        scheduledAt: new Date().toISOString(),
      },
      { jobId },
    );

    expect(job1.id).toBe(jobId);

    // Attempt re-enqueue with same jobId
    const job2 = await emailSendQueue.add(
      "send-email",
      {
        emailMessageId: fixedId,
        campaignId: "c1",
        senderId: senderIds[0],
        userId: testUserId,
        sequenceNumber: 0,
        scheduledAt: new Date().toISOString(),
      },
      { jobId },
    );

    expect(job2.id).toBe(jobId);

    await job1.remove();
  });
});
