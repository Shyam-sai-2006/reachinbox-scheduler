import http from "http";
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
if (env.API_URL) {
  console.log(`- Bound API Service (Vercel Binding): ${env.API_URL}`);
}
console.log("=".repeat(60));

async function startWorker() {
  // 1. Run startup reconciliation to ensure no scheduled DB records are lost
  try {
    await runStartupReconciliation();
  } catch (err: any) {
    console.warn("[WORKER] Startup reconciliation warning:", err.message);
  }

  // 1b. Verify bound API service connection if API_URL is provided via Vercel service binding
  if (env.API_URL) {
    try {
      const apiHealthUrl = new URL("/health", env.API_URL);
      const res = await fetch(apiHealthUrl.toString(), {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        console.log(`✅ [WORKER] Successfully connected to bound API at ${env.API_URL}`);
      }
    } catch (err: any) {
      console.warn(`[WORKER WARN] Bound API ping failed at ${env.API_URL}:`, err.message);
    }
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

  // 5. Start lightweight HTTP server for Vercel container runtime health checks & service bindings
  const server = http.createServer(async (req, res) => {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );

    if (url.pathname === "/health" || url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "worker",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (url.pathname === "/ready") {
      let redisOk = false;
      let dbOk = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbOk = true;
      } catch {}
      try {
        const pong = await getRedisClient().ping();
        redisOk = pong === "PONG";
      } catch {}
      const ready = redisOk && dbOk;
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: ready ? "ready" : "unhealthy",
          redis: redisOk,
          database: dbOk,
        }),
      );
      return;
    }

    if (url.pathname === "/reconcile" && req.method === "POST") {
      try {
        const result = await runStartupReconciliation();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(env.PORT, () => {
    console.log(`🩺 Worker internal HTTP server listening on port ${env.PORT}`);
  });

  // Graceful shutdown handling (Section 84)
  const shutdown = async (signal: string) => {
    console.log(
      `\n[SHUTDOWN] Received ${signal}. Gracefully stopping workers...`,
    );
    try {
      server.close();
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
