import { Queue } from "bullmq";
import { QueueEmailSendPayload } from "@reachinbox/shared";
import { prisma } from "../db/prisma.js";
import { getRedisClient } from "../queues/redis.js";

export const EMAIL_SEND_QUEUE_NAME = "email-send";

/**
 * Reconciles scheduled PostgreSQL emails with BullMQ queue to recover from crashes
 * between DB commit and Redis queue insertion.
 */
export async function runStartupReconciliation(): Promise<{
  reconciledCount: number;
}> {
  console.log("[RECONCILIATION] Checking for unqueued scheduled emails...");
  const queue = new Queue<QueueEmailSendPayload>(EMAIL_SEND_QUEUE_NAME, {
    connection: getRedisClient(),
  });

  let reconciledCount = 0;

  try {
    const scheduledMessages = await prisma.emailMessage.findMany({
      where: {
        status: "scheduled",
      },
      select: {
        id: true,
        campaignId: true,
        userId: true,
        senderId: true,
        sequenceNumber: true,
        scheduledAt: true,
        queueJobId: true,
      },
    });

    for (const msg of scheduledMessages) {
      const jobId = msg.queueJobId || `email-${msg.id}`;
      const existingJob = await queue.getJob(jobId);

      if (!existingJob) {
        // Missing from queue! Re-enqueue deterministically
        const delay = Math.max(0, msg.scheduledAt.getTime() - Date.now());
        await queue.add(
          "send-email",
          {
            emailMessageId: msg.id,
            campaignId: msg.campaignId,
            senderId: msg.senderId,
            userId: msg.userId,
            sequenceNumber: msg.sequenceNumber,
            scheduledAt: msg.scheduledAt.toISOString(),
          },
          {
            jobId,
            delay,
          },
        );
        reconciledCount++;
        console.log(
          `[RECONCILIATION] Re-enqueued missing job ${jobId} (scheduled for ${msg.scheduledAt.toISOString()})`,
        );
      }
    }

    console.log(
      `[RECONCILIATION] Completed. Checked ${scheduledMessages.length} scheduled records. Re-enqueued ${reconciledCount} missing jobs.`,
    );
  } catch (err: any) {
    console.error("[RECONCILIATION ERROR]", err.message);
  } finally {
    await queue.close();
  }

  return { reconciledCount };
}

// Allow standalone execution: tsx src/scripts/reconcile.ts
if (
  process.argv[1] &&
  (process.argv[1].endsWith("reconcile.ts") ||
    process.argv[1].endsWith("reconcile.js"))
) {
  runStartupReconciliation().then(() => {
    prisma.$disconnect();
    process.exit(0);
  });
}
