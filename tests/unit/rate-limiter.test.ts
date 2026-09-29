import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Redis from "ioredis";
import { DistributedRateLimiter } from "../../apps/worker/src/services/rate-limiter/redis-rate-limiter.js";

describe("Unit & Integration Tests: Distributed Atomic Rate Limiter", () => {
  let redis: Redis;
  let limiter: DistributedRateLimiter;
  const testSenderId = `test-sender-${Date.now()}`;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
    });
    limiter = new DistributedRateLimiter(redis);
  });

  afterAll(async () => {
    // Cleanup keys
    const keys = await redis.keys(`*${testSenderId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it("allows send for the first reservation and reserves slot", async () => {
    const res = await limiter.reserveSendSlot(testSenderId, 2000, 5);

    expect(res.allowed).toBe(true);
    expect(res.reachedLimit).toBe(false);
    expect(res.currentCount).toBe(1);
    expect(res.scheduledSendAtMs).toBeLessThanOrEqual(Date.now() + 100);
  });

  it("enforces minimum delay between consecutive sends for the same sender", async () => {
    const res2 = await limiter.reserveSendSlot(testSenderId, 2000, 5);

    expect(res2.allowed).toBe(true);
    expect(res2.currentCount).toBe(2);
    // Should be spaced at least ~2000ms after the first slot
    expect(res2.scheduledSendAtMs).toBeGreaterThan(Date.now() + 1500);
  });

  it("atomically enforces hourly limit and rejects reservation when limit is reached", async () => {
    // Fill up to limit of 5
    await limiter.reserveSendSlot(testSenderId, 2000, 5); // count 3
    await limiter.reserveSendSlot(testSenderId, 2000, 5); // count 4
    const res5 = await limiter.reserveSendSlot(testSenderId, 2000, 5); // count 5

    expect(res5.allowed).toBe(true);
    expect(res5.reachedLimit).toBe(true);
    expect(res5.currentCount).toBe(5);

    // 6th call should be denied and rescheduled to next hour
    const res6 = await limiter.reserveSendSlot(testSenderId, 2000, 5);
    expect(res6.allowed).toBe(false);
    expect(res6.reachedLimit).toBe(true);
    expect(res6.retryAtMs).toBeGreaterThan(Date.now());
  });

  it("deduplicates Slack notifications atomically per sender per hour window", async () => {
    const windowKey = "2026-09-29T10:00:00.000Z";
    const firstCall = await limiter.shouldNotifySlack(testSenderId, windowKey);
    const secondCall = await limiter.shouldNotifySlack(testSenderId, windowKey);
    const thirdCall = await limiter.shouldNotifySlack(testSenderId, windowKey);

    expect(firstCall).toBe(true);
    expect(secondCall).toBe(false);
    expect(thirdCall).toBe(false);
  });
});
