import { describe, it, expect, beforeAll } from "vitest";
import {
  elasticsearchService,
  EMAILS_INDEX,
} from "../../apps/api/src/services/elasticsearch/elasticsearch.service.js";

describe("Integration Tests: Elasticsearch Indexing & User-Isolated Search", () => {
  const userA = `user-a-${Date.now()}`;
  const userB = `user-b-${Date.now()}`;

  beforeAll(async () => {
    await elasticsearchService.ensureIndexExists();
  });

  it("indexes documents and searches across subject, recipient, and body", async () => {
    const doc1 = {
      id: `es-doc-${Date.now()}-1`,
      userId: userA,
      campaignId: "camp-1",
      senderId: "sender-1",
      recipient: "developer.alice@outboxlabs.com",
      subject: "Quarterly Distributed Systems Review",
      body: "Reviewing our BullMQ delayed job scheduler and Redis rate limiter performance.",
      status: "scheduled",
      sequenceNumber: 0,
      scheduledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const doc2 = {
      id: `es-doc-${Date.now()}-2`,
      userId: userA,
      campaignId: "camp-1",
      senderId: "sender-1",
      recipient: "operations.bob@reachinbox.ai",
      subject: "Security Notice: OAuth Encryption",
      body: "All Slack and SMTP tokens are encrypted using AES-256-GCM.",
      status: "sent",
      sequenceNumber: 1,
      scheduledAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await elasticsearchService.bulkIndexEmails([doc1, doc2]);

    // Search by subject keyword
    const searchSubject = await elasticsearchService.searchEmails({
      userId: userA,
      query: "Distributed",
    });
    expect(searchSubject.total).toBeGreaterThanOrEqual(1);
    expect(searchSubject.items.some((i) => i.id === doc1.id)).toBe(true);

    // Search by recipient
    const searchRecipient = await elasticsearchService.searchEmails({
      userId: userA,
      query: "outboxlabs.com",
    });
    expect(searchRecipient.total).toBeGreaterThanOrEqual(1);
    expect(searchRecipient.items.some((i) => i.id === doc1.id)).toBe(true);

    // Search by body keyword
    const searchBody = await elasticsearchService.searchEmails({
      userId: userA,
      query: "AES-256-GCM",
    });
    expect(searchBody.total).toBeGreaterThanOrEqual(1);
    expect(searchBody.items.some((i) => i.id === doc2.id)).toBe(true);

    // Filter by status = 'sent'
    const searchSent = await elasticsearchService.searchEmails({
      userId: userA,
      status: "sent",
    });
    expect(searchSent.items.every((i) => i.status === "sent")).toBe(true);
  });

  it("strictly enforces user data isolation in search queries", async () => {
    // User B tries to search for User A's unique document
    const secretKeyword = `ultra-secret-token-${Date.now()}`;
    const userADoc = {
      id: `private-doc-${Date.now()}`,
      userId: userA,
      campaignId: "camp-private",
      senderId: "s1",
      recipient: "confidential@company.com",
      subject: secretKeyword,
      body: "Confidential corporate strategy",
      status: "scheduled",
      sequenceNumber: 0,
      scheduledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await elasticsearchService.indexEmail(userADoc);

    // User A can find it
    const resA = await elasticsearchService.searchEmails({
      userId: userA,
      query: secretKeyword,
    });
    expect(resA.total).toBeGreaterThanOrEqual(1);

    // User B CANNOT find it
    const resB = await elasticsearchService.searchEmails({
      userId: userB,
      query: secretKeyword,
    });
    expect(resB.total).toBe(0);
    expect(resB.items).toHaveLength(0);
  });
});
