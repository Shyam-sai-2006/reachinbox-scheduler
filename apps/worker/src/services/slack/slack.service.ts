import axios from "axios";
import { prisma } from "../../db/prisma.js";
import { decryptText } from "../../utils/crypto.js";

export class WorkerSlackService {
  public async sendRateLimitAlert(
    userId: string,
    alertData: {
      senderEmail: string;
      hourlyLimit: number;
      hourWindow: string;
    },
  ): Promise<boolean> {
    try {
      const conn = await prisma.slackConnection.findUnique({
        where: { userId },
      });

      if (!conn || !conn.webhookUrlEncrypted) {
        return false;
      }

      const webhookUrl = decryptText(conn.webhookUrlEncrypted);
      if (!webhookUrl) return false;

      if (webhookUrl.includes("MOCK")) {
        console.log(
          `[SLACK WORKER MOCK] Rate limit alert received for ${alertData.senderEmail}`,
        );
        return true;
      }

      const messagePayload = {
        text: `⚠️ *ReachInbox Rate Limit Reached*`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "⚠️ ReachInbox Rate Limit Reached",
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Sender:*\n${alertData.senderEmail}`,
              },
              {
                type: "mrkdwn",
                text: `*Hourly Limit:*\n${alertData.hourlyLimit} emails/hour`,
              },
              {
                type: "mrkdwn",
                text: `*Hour Window:*\n${alertData.hourWindow}`,
              },
              {
                type: "mrkdwn",
                text: `*Status:*\nRescheduled to next window`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "Emails exceeding the hourly threshold are automatically rescheduled to the subsequent window. No emails are dropped.",
              },
            ],
          },
        ],
      };

      await axios.post(webhookUrl, messagePayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      });

      console.log(
        `[SLACK WORKER] Rate limit alert successfully delivered to Slack for ${alertData.senderEmail}`,
      );
      return true;
    } catch (err: any) {
      console.warn(
        "[SLACK WORKER WARN] Failed to send Slack alert:",
        err.message,
      );
      return false;
    }
  }
}

export const workerSlackService = new WorkerSlackService();
