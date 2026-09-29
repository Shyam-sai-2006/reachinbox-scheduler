import { Client } from "@elastic/elasticsearch";
import { env } from "../../config/env.js";

export const EMAILS_INDEX = "emails";

export interface EmailDocument {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  sequenceNumber: number;
  scheduledAt: string;
  sentAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class WorkerElasticsearchService {
  private client: Client;

  constructor() {
    this.client = new Client({
      node: env.ELASTICSEARCH_NODE || "http://localhost:9200",
      auth:
        env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD
          ? {
              username: env.ELASTICSEARCH_USERNAME,
              password: env.ELASTICSEARCH_PASSWORD,
            }
          : undefined,
    });
  }

  public async updateEmailStatus(
    id: string,
    status: string,
    updates: Partial<EmailDocument>,
  ): Promise<void> {
    try {
      await this.client.update({
        index: EMAILS_INDEX,
        id,
        doc: {
          status,
          updatedAt: new Date().toISOString(),
          ...updates,
        },
        doc_as_upsert: true,
        refresh: false,
      });
    } catch (err: any) {
      console.warn(
        `[ES WARN] Failed to update email ${id} in Elasticsearch:`,
        err.message,
      );
    }
  }

  public async indexEmail(doc: EmailDocument): Promise<void> {
    try {
      await this.client.index({
        index: EMAILS_INDEX,
        id: doc.id,
        document: doc,
        refresh: false,
      });
    } catch (err: any) {
      console.warn(
        `[ES WARN] Failed to index email ${doc.id} in Elasticsearch:`,
        err.message,
      );
    }
  }

  public async bulkIndexEmails(docs: EmailDocument[]): Promise<void> {
    if (!docs || docs.length === 0) return;
    try {
      const operations = docs.flatMap((doc) => [
        { index: { _index: EMAILS_INDEX, _id: doc.id } },
        doc,
      ]);
      await this.client.bulk({
        refresh: true,
        operations,
      });
    } catch (err: any) {
      console.warn("[ES WARN] Bulk index failed in worker:", err.message);
    }
  }
}

export const workerElasticsearchService = new WorkerElasticsearchService();
