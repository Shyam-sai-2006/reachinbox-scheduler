import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../apps/api/src/db/prisma.js";
import { emailSendQueue } from "../../apps/api/src/queues/email.queue.js";
import { runStartupReconciliation } from "../../apps/worker/src/scripts/reconcile.js";
import { smtpService } from "../../apps/api/src/services/smtp/smtp.service.js";

describe("Integration Tests: Startup Queue Reconciliation", () => {
  let testUserId: string;
  let testSenderId: string;
  let campaignId: string;

  beforeAll(async () => {
    await smtpService.ensureSendersSeeded();
    const senders = await smtpService.getActiveSenders();
    testSenderId = senders[0].id;

    const user = await prisma.user.upsert({
      where: { email: "reconcile.test@reachinbox.local" },
      update: {},
      create: {
        email: "reconcile.test@reachinbox.local",
        name: "Reconciliation Tester",
      },
    });
    testUserId = user.id;

    campaignId = `camp-rec-${Date.now()}`;
    await prisma.campaign.create({
      data: {
        id: campaignId,
        userId: testUserId,
        subject: "Reconciliation Test",
        body: "Testing startup recovery",
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

  it("detects scheduled DB records missing from BullMQ and re-enqueues them with stable job IDs", async () => {
    const msgId = `msg-reconcile-${Date.now()}`;
    const expectedJobId = `email-${msgId}`;

    // 1. Create a DB record in scheduled state without enqueuing into BullMQ (simulating crash between DB commit and queue insert)
    await prisma.emailMessage.create({
      data: {
        id: msgId,
        campaignId,
        userId: testUserId,
        senderId: testSenderId,
        recipient: "reconcile.target@example.com",
        subject: "Recovery Subject",
        body: "Recovery Body",
        sequenceNumber: 0,
        scheduledAt: new Date(Date.now() + 10000), // scheduled for 10s future
        status: "scheduled",
        deterministicMessageId: `<email-message-${msgId}@reachinbox.local>`,
        queueJobId: expectedJobId,
      },
    });

    // Verify job is NOT in BullMQ yet
    let job = await emailSendQueue.getJob(expectedJobId);
    expect(job).toBeUndefined();

    // 2. Run startup reconciliation routine
    const res = await runStartupReconciliation();
    expect(res.reconciledCount).toBeGreaterThanOrEqual(1);

    // 3. Verify job was re-enqueued with exact deterministic jobId
    job = await emailSendQueue.getJob(expectedJobId);
    expect(job).toBeDefined();
    expect(job?.id).toBe(expectedJobId);
    expect(job?.data.emailMessageId).toBe(msgId);

    // 4. Running reconciliation again should NOT duplicate the job
    const secondRun = await runStartupReconciliation();
    expect(secondRun.reconciledCount).toBe(0);

    // Cleanup
    await job?.remove();
  });
});
