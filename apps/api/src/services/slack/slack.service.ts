import axios from "axios";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { encryptText, decryptText } from "../../utils/crypto.js";

export interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  app_id?: string;
  authed_user?: {
    id: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
  team?: {
    id: string;
    name: string;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
  access_token?: string;
  token_type?: string;
  scope?: string;
}

export class SlackService {
  /**
   * Generates authorization URL for Slack OAuth v2
   */
  public getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      scope: "incoming-webhook",
      redirect_uri: env.SLACK_REDIRECT_URI,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for access token & incoming webhook URL
   */
  public async handleOAuthCallback(
    code: string,
    userId: string,
  ): Promise<{ teamName: string; channelName: string }> {
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    });

    const response = await axios.post<SlackOAuthAccessResponse>(
      "https://slack.com/api/oauth.v2.access",
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000,
      },
    );

    const data = response.data;
    if (!data.ok || !data.incoming_webhook) {
      throw new Error(
        `Slack OAuth exchange failed: ${data.error || "No incoming webhook provided"}`,
      );
    }

    const teamId = data.team?.id || "unknown_team";
    const teamName = data.team?.name || "Slack Workspace";
    const channelId = data.incoming_webhook.channel_id || "unknown_channel";
    const channelName = data.incoming_webhook.channel || "general";
    const webhookUrlEncrypted = encryptText(data.incoming_webhook.url);
    const accessTokenEncrypted = data.access_token
      ? encryptText(data.access_token)
      : null;

    // Upsert connection for user
    await prisma.slackConnection.upsert({
      where: { userId },
      update: {
        teamId,
        teamName,
        channelId,
        channelName,
        webhookUrlEncrypted,
        accessTokenEncrypted,
        updatedAt: new Date(),
      },
      create: {
        userId,
        teamId,
        teamName,
        channelId,
        channelName,
        webhookUrlEncrypted,
        accessTokenEncrypted,
      },
    });

    return { teamName, channelName };
  }

  /**
   * Disconnects Slack integration for user
   */
  public async disconnect(userId: string): Promise<void> {
    await prisma.slackConnection.deleteMany({
      where: { userId },
    });
  }

  /**
   * Gets connection status for user
   */
  public async getStatus(userId: string): Promise<{
    connected: boolean;
    teamName?: string;
    channelName?: string;
    connectedAt?: string;
  }> {
    const conn = await prisma.slackConnection.findUnique({
      where: { userId },
    });

    if (!conn) {
      return { connected: false };
    }

    return {
      connected: true,
      teamName: conn.teamName,
      channelName: conn.channelName,
      connectedAt: conn.connectedAt.toISOString(),
    };
  }

  /**
   * Sends rate limit reached notification to user's connected Slack webhook
   */
  public async sendRateLimitAlert(
    userId: string,
    alertData: {
      senderEmail: string;
      hourlyLimit: number;
      hourWindow: string;
      rescheduledCount?: number;
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
                text: `*Action:*\nRescheduled to next available window`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "Emails exceeding the hourly threshold are automatically queued for the subsequent hourly window. No emails are dropped.",
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
        `[SLACK] Sent rate limit alert for sender ${alertData.senderEmail} in window ${alertData.hourWindow}`,
      );
      return true;
    } catch (err: any) {
      console.warn(
        "[SLACK WARN] Failed to send rate limit notification to Slack:",
        err.message,
      );
      return false;
    }
  }
}

export const slackService = new SlackService();
