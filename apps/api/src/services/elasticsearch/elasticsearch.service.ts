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

export class ElasticsearchService {
  private client: Client;
  private isConnected = false;

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

  public getClient(): Client {
    return this.client;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      this.isConnected = res === true;
      return this.isConnected;
    } catch (err: any) {
      this.isConnected = false;
      return false;
    }
  }

  public async ensureIndexExists(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: EMAILS_INDEX });
      if (!exists) {
        await this.client.indices.create({
          index: EMAILS_INDEX,
          body: {
            mappings: {
              properties: {
                id: { type: "keyword" },
                userId: { type: "keyword" },
                campaignId: { type: "keyword" },
                senderId: { type: "keyword" },
                recipient: {
                  type: "keyword",
                  fields: {
                    text: { type: "text" },
                  },
                },
                subject: { type: "text" },
                body: { type: "text" },
                status: { type: "keyword" },
                sequenceNumber: { type: "integer" },
                scheduledAt: { type: "date" },
                sentAt: { type: "date" },
                failedAt: { type: "date" },
                failureReason: { type: "text" },
                createdAt: { type: "date" },
                updatedAt: { type: "date" },
              },
            },
          },
        });
        console.log(`[ES] Created index "${EMAILS_INDEX}" successfully`);
      }
    } catch (err: any) {
      console.warn(
        `[ES WARN] Failed to ensure index "${EMAILS_INDEX}":`,
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
        refresh: "wait_for",
      });
    } catch (err: any) {
      console.warn(`[ES WARN] Failed to index email ${doc.id}:`, err.message);
    }
  }

  public async bulkIndexEmails(docs: EmailDocument[]): Promise<void> {
    if (!docs || docs.length === 0) return;
    try {
      const operations = docs.flatMap((doc) => [
        { index: { _index: EMAILS_INDEX, _id: doc.id } },
        doc,
      ]);
      const bulkResponse = await this.client.bulk({
        refresh: true,
        operations,
      });
      if (bulkResponse.errors) {
        console.warn("[ES WARN] Bulk indexing had some document errors");
      }
    } catch (err: any) {
      console.warn("[ES WARN] Bulk index failed:", err.message);
    }
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
        refresh: "wait_for",
      });
    } catch (err: any) {
      console.warn(
        `[ES WARN] Failed to update email ${id} in ES:`,
        err.message,
      );
    }
  }

  public async searchEmails(params: {
    userId: string;
    query?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: EmailDocument[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const from = (page - 1) * pageSize;

    const mustConditions: any[] = [];
    const filterConditions: any[] = [{ term: { userId: params.userId } }];

    if (params.status) {
      filterConditions.push({ term: { status: params.status } });
    }

    if (params.query && params.query.trim()) {
      const q = params.query.trim();
      mustConditions.push({
        bool: {
          should: [
            {
              multi_match: {
                query: q,
                fields: ["subject^2", "body", "recipient.text"],
                fuzziness: "AUTO",
              },
            },
            {
              wildcard: {
                recipient: `*${q.toLowerCase()}*`,
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    } else {
      mustConditions.push({ match_all: {} });
    }

    try {
      const response = await this.client.search<EmailDocument>({
        index: EMAILS_INDEX,
        from,
        size: pageSize,
        sort: [{ scheduledAt: { order: "desc" } }],
        query: {
          bool: {
            must: mustConditions,
            filter: filterConditions,
          },
        },
      });

      const total =
        typeof response.hits.total === "number"
          ? response.hits.total
          : response.hits.total?.value || 0;

      const items = response.hits.hits.map(
        (hit) => hit._source as EmailDocument,
      );
      return { items, total };
    } catch (err: any) {
      console.warn("[ES WARN] Search query failed:", err.message);
      return { items: [], total: 0 };
    }
  }
}

export const elasticsearchService = new ElasticsearchService();
