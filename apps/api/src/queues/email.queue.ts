import { Queue } from "bullmq";
import { QueueEmailSendPayload } from "@reachinbox/shared";
import { getRedisClient } from "./redis.js";

export const EMAIL_SEND_QUEUE_NAME = "email-send";

export const emailSendQueue = new Queue<QueueEmailSendPayload>(
  EMAIL_SEND_QUEUE_NAME,
  {
    connection: getRedisClient(),
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // keep for 24h
        count: 5000,
      },
      removeOnFail: {
        age: 48 * 3600, // keep for 48h
        count: 5000,
      },
    },
  },
);
