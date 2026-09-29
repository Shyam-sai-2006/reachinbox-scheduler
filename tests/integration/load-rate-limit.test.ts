import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Redis from "ioredis";
import { DistributedRateLimiter } from "../../apps/worker/src/services/rate-limiter/redis-rate-limiter.js";

describe("Integration & Load Tests: Rate Limit & Concurrent Slot Reservation", () => {
  let redis: Redis;
  let limiter: DistributedRateLimiter;
  const loadSenderId = `load-sender-${Date.now()}`;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
    });
    limiter = new DistributedRateLimiter(redis);
  });

  afterAll(async () => {
    const keys = await redis.keys(`*${loadSenderId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it("handles 20 concurrent reservation requests with hourly limit = 5 safely without races", async () => {
    const hourlyLimit = 5;
    const minDelayMs = 1000;
    const targetTime = new Date();

    // Fire 20 parallel requests simultaneously (simulating 10-20 workers racing)
    const promises = Array.from({ length: 20 }).map(() =>
      limiter.reserveSendSlot(
        loadSenderId,
        minDelayMs,
        hourlyLimit,
        targetTime,
      ),
    );

    const results = await Promise.all(promises);

    const allowedResults = results.filter((r) => r.allowed);
    const rejectedResults = results.filter((r) => !r.allowed);

    // Exactly 5 reservations must succeed
    expect(allowedResults).toHaveLength(5);
    // Exactly 15 reservations must be cleanly rejected for rescheduling
    expect(rejectedResults).toHaveLength(15);

    // All rejected reservations must have retryAtMs pointing to next hour window
    for (const rejected of rejectedResults) {
      expect(rejected.reachedLimit).toBe(true);
      expect(rejected.retryAtMs).toBeDefined();
      expect(rejected.retryAtMs).toBeGreaterThan(Date.now());
    }

    // Verify Slack notification trigger count
    const hourWindow = allowedResults[0].hourWindow;
    const notifyPromises = Array.from({ length: 20 }).map(() =>
      limiter.shouldNotifySlack(loadSenderId, hourWindow),
    );
    const notifyResults = await Promise.all(notifyPromises);

    // Only ONE worker should have acquired the Slack notification lock
    const notifiedCount = notifyResults.filter(Boolean).length;
    expect(notifiedCount).toBe(1);
  });
});
