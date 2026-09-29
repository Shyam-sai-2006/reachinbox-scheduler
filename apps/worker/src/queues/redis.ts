import { Redis } from "ioredis";
import { env } from "../config/env.js";

let sharedRedis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!sharedRedis) {
    sharedRedis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    sharedRedis.on("error", (err) => {
      console.warn("[WORKER REDIS WARN]", err.message);
    });
  }
  return sharedRedis;
}
