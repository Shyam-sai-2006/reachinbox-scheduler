import { Queue } from "bullmq";
import { QueueEmailIndexPayload } from "@reachinbox/shared";
import { getRedisClient } from "./redis.js";

export const EMAIL_INDEX_QUEUE_NAME = "email-index";

export const emailIndexQueue = new Queue<QueueEmailIndexPayload>(
  EMAIL_INDEX_QUEUE_NAME,
  {
    connection: getRedisClient(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 2000,
      },
      removeOnFail: {
        age: 24 * 3600,
        count: 2000,
      },
    },
  },
);
