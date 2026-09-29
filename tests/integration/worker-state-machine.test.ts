import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../apps/api/src/db/prisma.js";
import { processEmailSendJob } from "../../apps/worker/src/processors/email.processor.js";
import { smtpService } from "../../apps/api/src/services/smtp/smtp.service.js";

describe("Integration Tests: Worker State Machine & Idempotency", () => {
  let testUserId: string;
  let testSenderId: string;
  let campaignId: string;

  beforeAll(async () => {
    await smtpService.ensureSendersSeeded();
    const senders = await smtpService.getActiveSenders();
    testSenderId = senders[0].id;

    const user = await prisma.user.upsert({
      where: { email: "worker.state.test@reachinbox.local" },
      update: {},
      create: {
        email: "worker.state.test@reachinbox.local",
        name: "Worker State Tester",
      },
    });
    testUserId = user.id;

    campaignId = `camp-state-${Date.now()}`;
    await prisma.campaign.create({
      data: {
        id: campaignId,
        userId: testUserId,
        subject: "State Machine Test",
        body: "Testing state transitions and idempotency",
        startAt: new Date(),
        delayMs: 1000,
        hourlyLimit: 100,
      },
    });
  });

  afterAll(async () => {
    await prisma.emailMessage.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it("atomically transitions scheduled -> sending -> sent and saves delivery details", async () => {
    const msgId = `msg-state-1-${Date.now()}`;
    await prisma.emailMessage.create({
      data: {
        id: msgId,
        campaignId,
        userId: testUserId,
        senderId: testSenderId,
        recipient: "recipient1@example.com",
        subject: "Welcome to ReachInbox",
        body: "Plain text email body for Ethereal test delivery.",
        sequenceNumber: 0,
        scheduledAt: new Date(),
        status: "scheduled",
        deterministicMessageId: `<email-message-${msgId}@reachinbox.local>`,
        queueJobId: `email-${msgId}`,
      },
    });

    const mockJob: any = {
      id: `email-${msgId}`,
      data: {
        emailMessageId: msgId,
        campaignId,
        senderId: testSenderId,
        userId: testUserId,
        sequenceNumber: 0,
        scheduledAt: new Date().toISOString(),
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const result = await processEmailSendJob(mockJob);
    expect(result.success).toBe(true);

    const updated = await prisma.emailMessage.findUnique({
      where: { id: msgId },
    });

    expect(updated?.status).toBe("sent");
    expect(updated?.sentAt).toBeDefined();
    expect(updated?.sentAt).not.toBeNull();
    expect(updated?.processingLeaseUntil).toBeNull();
  });

  it("guarantees idempotency: skipping SMTP send if message status is already sent", async () => {
    const msgId = `msg-already-sent-${Date.now()}`;
    const sentTime = new Date(Date.now() - 3600000);

    await prisma.emailMessage.create({
      data: {
        id: msgId,
        campaignId,
        userId: testUserId,
        senderId: testSenderId,
        recipient: "already.sent@example.com",
        subject: "Already Sent Message",
        body: "This message was already sent.",
        sequenceNumber: 1,
        scheduledAt: new Date(),
        status: "sent",
        sentAt: sentTime,
        previewUrl: "https://ethereal.email/message/already-sent-url",
        deterministicMessageId: `<email-message-${msgId}@reachinbox.local>`,
        queueJobId: `email-${msgId}`,
      },
    });

    const mockJob: any = {
      id: `email-${msgId}`,
      data: {
        emailMessageId: msgId,
        campaignId,
        senderId: testSenderId,
        userId: testUserId,
        sequenceNumber: 1,
        scheduledAt: new Date().toISOString(),
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    // Process again
    const result = await processEmailSendJob(mockJob);
    expect(result.success).toBe(true);

    // Verify DB was NOT re-sent or overwritten
    const check = await prisma.emailMessage.findUnique({
      where: { id: msgId },
    });
    expect(check?.status).toBe("sent");
    expect(check?.sentAt?.getTime()).toBe(sentTime.getTime());
    expect(check?.previewUrl).toBe(
      "https://ethereal.email/message/already-sent-url",
    );
  });
});
