import { Job } from "bullmq";
import { QueueEmailIndexPayload } from "@reachinbox/shared";
import { prisma } from "../db/prisma.js";
import { workerElasticsearchService } from "../services/elasticsearch/elasticsearch.service.js";

export async function processEmailIndexJob(
  job: Job<QueueEmailIndexPayload>,
): Promise<void> {
  const { emailMessageId, action } = job.data;

  const emailMessage = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
  });

  if (!emailMessage) {
    return;
  }

  const doc = {
    id: emailMessage.id,
    userId: emailMessage.userId,
    campaignId: emailMessage.campaignId,
    senderId: emailMessage.senderId,
    recipient: emailMessage.recipient,
    subject: emailMessage.subject,
    body: emailMessage.body,
    status: emailMessage.status,
    sequenceNumber: emailMessage.sequenceNumber,
    scheduledAt: emailMessage.scheduledAt.toISOString(),
    sentAt: emailMessage.sentAt ? emailMessage.sentAt.toISOString() : null,
    failedAt: emailMessage.failedAt
      ? emailMessage.failedAt.toISOString()
      : null,
    failureReason: emailMessage.failureReason,
    createdAt: emailMessage.createdAt.toISOString(),
    updatedAt: emailMessage.updatedAt.toISOString(),
  };

  if (action === "index") {
    await workerElasticsearchService.indexEmail(doc);
  } else {
    await workerElasticsearchService.updateEmailStatus(doc.id, doc.status, doc);
  }

  await prisma.emailMessage.update({
    where: { id: emailMessageId },
    data: { indexedAt: new Date() },
  });

  console.log(
    `[ELASTICSEARCH_INDEXED] Indexed email ${emailMessageId} (${action})`,
  );
}
