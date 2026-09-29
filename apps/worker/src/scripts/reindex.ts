import { prisma } from "../db/prisma.js";
import {
  workerElasticsearchService,
  EMAILS_INDEX,
} from "../services/elasticsearch/elasticsearch.service.js";

async function runReindex() {
  console.log(
    "[REINDEX] Starting bulk reindex of all emails from PostgreSQL to Elasticsearch...",
  );
  const startTime = Date.now();

  try {
    const totalCount = await prisma.emailMessage.count();
    console.log(`[REINDEX] Found ${totalCount} email records in PostgreSQL.`);

    if (totalCount === 0) {
      console.log("[REINDEX] No email records to index.");
      return;
    }

    const batchSize = 500;
    let processed = 0;

    for (let skip = 0; skip < totalCount; skip += batchSize) {
      const messages = await prisma.emailMessage.findMany({
        skip,
        take: batchSize,
        orderBy: { createdAt: "asc" },
      });

      const docs = messages.map((msg) => ({
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
        sentAt: msg.sentAt ? msg.sentAt.toISOString() : null,
        failedAt: msg.failedAt ? msg.failedAt.toISOString() : null,
        failureReason: msg.failureReason,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
      }));

      await workerElasticsearchService.bulkIndexEmails(docs);
      processed += docs.length;
      console.log(
        `[REINDEX] Progress: ${processed}/${totalCount} documents indexed.`,
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `[REINDEX] Successfully reindexed ${processed} documents into "${EMAILS_INDEX}" in ${duration}s.`,
    );
  } catch (err: any) {
    console.error("[REINDEX ERROR] Reindexing failed:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runReindex();
