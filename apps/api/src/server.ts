import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { smtpService } from "./services/smtp/smtp.service.js";
import { elasticsearchService } from "./services/elasticsearch/elasticsearch.service.js";
import { getRedisClient } from "./queues/redis.js";

const app = createApp();
const PORT = env.PORT || 4000;

async function bootstrap() {
  console.log("=".repeat(60));
  console.log("🚀 ReachInbox API Server Bootstrapping...");
  console.log(`- Port: ${PORT}`);
  console.log(`- Frontend URL: ${env.FRONTEND_URL}`);
  console.log(`- Database: ${env.DATABASE_URL.replace(/:[^:]*@/, ":***@")}`);
  console.log(`- Redis: ${env.REDIS_URL.replace(/:[^:]*@/, ":***@")}`);
  console.log(`- Elasticsearch: ${env.ELASTICSEARCH_NODE}`);
  console.log("=".repeat(60));

  // 1. Ensure senders exist
  try {
    await smtpService.ensureSendersSeeded();
  } catch (err: any) {
    console.warn("[SERVER WARN] Senders initialization warning:", err.message);
  }

  // 2. Ensure Elasticsearch index exists
  try {
    await elasticsearchService.ensureIndexExists();
  } catch (err: any) {
    console.warn(
      "[SERVER WARN] Elasticsearch index initialization warning:",
      err.message,
    );
  }

  // 3. Start HTTP server
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `✅ ReachInbox API Server listening at http://localhost:${PORT}`,
    );
    console.log(
      `📊 Bull Board Dashboard available at http://localhost:${PORT}/admin/queues`,
    );
    console.log(`🩺 Health check at http://localhost:${PORT}/health`);
  });

  // 4. Graceful Shutdown (Section 84)
  const shutdown = async (signal: string) => {
    console.log(
      `\n[SHUTDOWN] Received ${signal}. Gracefully stopping API server...`,
    );
    server.close(async () => {
      try {
        await prisma.$disconnect();
        const redis = getRedisClient();
        await redis.quit();
        console.log(
          "[SHUTDOWN] API server connections closed cleanly. Exiting.",
        );
        process.exit(0);
      } catch (err: any) {
        console.error("[SHUTDOWN ERROR]", err.message);
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("[FATAL SERVER ERROR]", err);
  process.exit(1);
});
