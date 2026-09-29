import { Worker, QueueEvents } from "bullmq";
import {
  QueueEmailSendPayload,
  QueueEmailIndexPayload,
} from "@reachinbox/shared";
import { env } from "./config/env.js";
import { getRedisClient } from "./queues/redis.js";
import { processEmailSendJob } from "./processors/email.processor.js";
import { processEmailIndexJob } from "./processors/index.processor.js";
import { runStartupReconciliation } from "./scripts/reconcile.js";
import { prisma } from "./db/prisma.js";

export const EMAIL_SEND_QUEUE_NAME = "email-send";
export const EMAIL_INDEX_QUEUE_NAME = "email-index";

console.log("=".repeat(60));
console.log("🚀 ReachInbox Email Worker Starting...");
console.log(`- Concurrency: ${env.WORKER_CONCURRENCY}`);
console.log(`- Minimum Send Delay: ${env.MIN_SEND_DELAY_MS}ms per sender`);
console.log(
  `- Max Hourly Limit: ${env.MAX_EMAILS_PER_HOUR_PER_SENDER} emails/hour per sender`,
);
console.log(`- Redis URL: ${env.REDIS_URL}`);
console.log(`- Elasticsearch: ${env.ELASTICSEARCH_NODE}`);
console.log("=".repeat(60));

async function startWorker() {
  // 1. Run startup reconciliation to ensure no scheduled DB records are lost
  try {
    await runStartupReconciliation();
  } catch (err: any) {
    console.warn("[WORKER] Startup reconciliation warning:", err.message);
  }

  // 2. Initialize email-send Worker with configurable concurrency
  const emailWorker = new Worker<QueueEmailSendPayload>(
    EMAIL_SEND_QUEUE_NAME,
    async (job, token) => {
      return processEmailSendJob(job, token);
    },
    {
      connection: getRedisClient(),
      concurrency: env.WORKER_CONCURRENCY,
      lockDuration: 30000,
      stalledInterval: 15000,
      maxStalledCount: 3,
    },
  );

  // 3. Initialize email-index Worker
  const indexWorker = new Worker<QueueEmailIndexPayload>(
    EMAIL_INDEX_QUEUE_NAME,
    async (job) => {
      return processEmailIndexJob(job);
    },
    {
      connection: getRedisClient(),
      concurrency: 5,
    },
  );

  // 4. Observability / Queue Events
  const sendEvents = new QueueEvents(EMAIL_SEND_QUEUE_NAME, {
    connection: getRedisClient(),
  });

  sendEvents.on("completed", ({ jobId }) => {
    console.log(`[QUEUE_EVENT] Job ${jobId} completed successfully.`);
  });

  sendEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`[QUEUE_EVENT] Job ${jobId} failed: ${failedReason}`);
  });

  sendEvents.on("stalled", ({ jobId }) => {
    console.warn(`[QUEUE_EVENT] Job ${jobId} stalled and will be recovered.`);
  });

  emailWorker.on("error", (err) => {
    console.error("[EMAIL_WORKER_ERROR]", err.message);
  });

  indexWorker.on("error", (err) => {
    console.error("[INDEX_WORKER_ERROR]", err.message);
  });

  console.log("✅ ReachInbox BullMQ Workers are active and consuming jobs!");

  // Graceful shutdown handling (Section 84)
  const shutdown = async (signal: string) => {
    console.log(
      `\n[SHUTDOWN] Received ${signal}. Gracefully stopping workers...`,
    );
    try {
      await emailWorker.close();
      await indexWorker.close();
      await sendEvents.close();
      await prisma.$disconnect();
      console.log("[SHUTDOWN] BullMQ workers closed cleanly. Exiting.");
      process.exit(0);
    } catch (err: any) {
      console.error("[SHUTDOWN ERROR]", err.message);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startWorker().catch((err) => {
  console.error("[FATAL WORKER ERROR]", err);
  process.exit(1);
});
