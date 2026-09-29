import { Redis } from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  scheduledSendAtMs: number;
  retryAtMs?: number;
  reachedLimit: boolean;
  currentCount: number;
  hourWindow: string;
}

const RATE_LIMIT_LUA_SCRIPT = `
local nextAvailKey = KEYS[1]
local hourlyKey = KEYS[2]

local nowMs = tonumber(ARGV[1])
local minDelayMs = tonumber(ARGV[2])
local hourlyLimit = tonumber(ARGV[3])
local nextHourStartMs = tonumber(ARGV[4])

-- Check current hourly count
local currentCount = tonumber(redis.call('GET', hourlyKey) or '0')

if currentCount >= hourlyLimit then
  -- Hourly limit exceeded, tell worker to delay until next hour window
  return { 0, nextHourStartMs, 1, currentCount }
end

-- Read next available send time for minimum delay spacing
local nextAvail = tonumber(redis.call('GET', nextAvailKey) or '0')
local sendAtMs = math.max(nowMs, nextAvail)

-- Reserve this slot by pushing next available time forward by minDelayMs
redis.call('SET', nextAvailKey, tostring(sendAtMs + minDelayMs), 'EX', 7200)

-- Increment hourly counter
local newCount = redis.call('INCR', hourlyKey)
if newCount == 1 then
  redis.call('EXPIRE', hourlyKey, 7200)
end

local reachedLimit = 0
if newCount >= hourlyLimit then
  reachedLimit = 1
end

return { 1, sendAtMs, reachedLimit, newCount }
`;

export class DistributedRateLimiter {
  private redis: Redis;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  public static getHourWindow(date: Date = new Date()) {
    const d = new Date(date);
    d.setUTCMinutes(0, 0, 0);
    const windowStartMs = d.getTime();
    const nextHourStartMs = windowStartMs + 60 * 60 * 1000;
    const windowKey = d.toISOString();
    return { windowKey, windowStartMs, nextHourStartMs };
  }

  public async reserveSendSlot(
    senderId: string,
    minDelayMs: number,
    hourlyLimit: number,
    targetTime: Date = new Date(),
  ): Promise<RateLimitResult> {
    const nowMs = Date.now();
    const { windowKey, nextHourStartMs } =
      DistributedRateLimiter.getHourWindow(targetTime);

    const nextAvailKey = `sender:${senderId}:next_available_ms`;
    const hourlyKey = `sender:${senderId}:hourly:${windowKey}`;

    const res = (await this.redis.eval(
      RATE_LIMIT_LUA_SCRIPT,
      2,
      nextAvailKey,
      hourlyKey,
      nowMs.toString(),
      minDelayMs.toString(),
      hourlyLimit.toString(),
      nextHourStartMs.toString(),
    )) as [number, number, number, number];

    const allowed = res[0] === 1;
    const targetMs = Number(res[1]);
    const reachedLimit = res[2] === 1;
    const currentCount = Number(res[3]);

    if (!allowed) {
      return {
        allowed: false,
        scheduledSendAtMs: targetMs,
        retryAtMs: targetMs,
        reachedLimit: true,
        currentCount,
        hourWindow: windowKey,
      };
    }

    return {
      allowed: true,
      scheduledSendAtMs: targetMs,
      reachedLimit,
      currentCount,
      hourWindow: windowKey,
    };
  }

  public async shouldNotifySlack(
    senderId: string,
    hourWindow: string,
  ): Promise<boolean> {
    const key = `slack-rate-limit-notified:${senderId}:${hourWindow}`;
    const result = await this.redis.set(key, "1", "EX", 7200, "NX");
    return result === "OK";
  }
}
