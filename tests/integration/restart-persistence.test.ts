import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Queue, Worker } from "bullmq";
import { prisma } from "../../apps/api/src/db/prisma.js";
import { getRedisClient } from "../../apps/worker/src/queues/redis.js";
import { processEmailSendJob } from "../../apps/worker/src/processors/email.processor.js";
import { smtpService } from "../../apps/api/src/services/smtp/smtp.service.js";
import { QueueEmailSendPayload } from "@reachinbox/shared";

describe("Integration Tests: Worker Restart & BullMQ Delayed Persistence", () => {
  let testUserId: string;
  let testSenderId: string;
  let queue: Queue<QueueEmailSendPayload>;
  const restartCampaignId = `camp-restart-${Date.now()}`;

  beforeAll(async () => {
    await smtpService.ensureSendersSeeded();
    const senders = await smtpService.getActiveSenders();
    testSenderId = senders[0].id;

    const user = await prisma.user.upsert({
      where: { email: "restart.tester@reachinbox.local" },
      update: {},
      create: {
        email: "restart.tester@reachinbox.local",
        name: "Restart Tester",
      },
    });
    testUserId = user.id;

    queue = new Queue("email-send", { connection: getRedisClient() });

    await prisma.campaign.create({
      data: {
        id: restartCampaignId,
        userId: testUserId,
        subject: "Restart Persistence Campaign",
        body: "Testing worker crash and delayed recovery",
        startAt: new Date(),
        delayMs: 1000,
        hourlyLimit: 100,
      },
    });
  });

  afterAll(async () => {
    await prisma.emailMessage.deleteMany({
      where: { campaignId: restartCampaignId },
    });
    await prisma.campaign.deleteMany({ where: { id: restartCampaignId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await queue.close();
    await prisma.$disconnect();
  });

  it("preserves BullMQ delayed job across worker crash and delivers safely on worker reboot", async () => {
    const msgId = `msg-restart-${Date.now()}`;
    const jobId = `email-${msgId}`;
    const delayMs = 6000; // 6 seconds in future
    const scheduledAt = new Date(Date.now() + delayMs);

    // 1. Create DB EmailMessage record
    await prisma.emailMessage.create({
      data: {
        id: msgId,
        campaignId: restartCampaignId,
        userId: testUserId,
        senderId: testSenderId,
        recipient: "restart.target@example.com",
        subject: "Crash Survival Test",
        body: "This email must survive a worker restart.",
        sequenceNumber: 0,
        scheduledAt,
        status: "scheduled",
        deterministicMessageId: `<email-message-${msgId}@reachinbox.local>`,
        queueJobId: jobId,
      },
    });

    // 2. Enqueue delayed job into BullMQ
    await queue.add(
      "send-email",
      {
        emailMessageId: msgId,
        campaignId: restartCampaignId,
        senderId: testSenderId,
        userId: testUserId,
        sequenceNumber: 0,
        scheduledAt: scheduledAt.toISOString(),
      },
      { jobId, delay: delayMs },
    );

    // 3. Confirm job exists in delayed state
    let job = await queue.getJob(jobId);
    expect(job).toBeDefined();
    const stateBefore = await job?.getState();
    expect(stateBefore).toBe("delayed");

    // 4. Start Worker Instance 1, then simulate abrupt crash/termination
    const worker1 = new Worker<QueueEmailSendPayload>(
      "email-send",
      async (j, token) => processEmailSendJob(j, token),
      { connection: getRedisClient() },
    );

    // Abruptly terminate worker 1 while job is still delayed
    await worker1.close(true);

    // 5. Verify delayed job still exists in Redis while worker is completely stopped
    job = await queue.getJob(jobId);
    expect(job).toBeDefined();
    expect(await job?.getState()).toBe("delayed");

    // 6. Start Worker Instance 2 (Reboot)
    const worker2 = new Worker<QueueEmailSendPayload>(
      "email-send",
      async (j, token) => processEmailSendJob(j, token),
      { connection: getRedisClient() },
    );

    // 7. Wait for scheduled delivery time to pass and job to complete sending
    let finalMsg = null;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      finalMsg = await prisma.emailMessage.findUnique({ where: { id: msgId } });
      if (finalMsg?.status === "sent") break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(finalMsg?.status).toBe("sent");
    expect(finalMsg?.sentAt).toBeDefined();

    // 9. Confirm no duplicate records exist
    const count = await prisma.emailMessage.count({
      where: { id: msgId },
    });
    expect(count).toBe(1);

    await worker2.close();
  }, 20000);
});
