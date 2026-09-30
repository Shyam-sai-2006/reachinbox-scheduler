import { Request, Response } from "express";
import crypto from "crypto";
import { slackService } from "../../services/slack/slack.service.js";
import { env } from "../../config/env.js";

export class SlackController {
  public static async getStatus(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const status = await slackService.getStatus(userId);
    res.json({
      success: true,
      data: status,
    });
  }

  public static async connect(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;

    const isMock =
      !env.SLACK_CLIENT_ID ||
      env.SLACK_CLIENT_ID.includes("mock-or-real") ||
      env.SLACK_CLIENT_ID.includes("example");

    if (isMock) {
      // Connect instantly in development so users don't get Slack's invalid client_id error
      await slackService.connectMock(userId);
      res.redirect(`${env.FRONTEND_URL}/?slack=connected`);
      return;
    }

    const state = `${userId}:${crypto.randomBytes(16).toString("hex")}`;
    (req.session as any).slackOAuthState = state;

    const authUrl = slackService.getAuthorizationUrl(state);
    res.redirect(authUrl);
  }

  public static async connectWebhook(
    req: Request,
    res: Response,
  ): Promise<void> {
    const userId = req.user!.id;
    const { webhookUrl, channelName, teamName } = req.body;

    if (!webhookUrl || typeof webhookUrl !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_WEBHOOK", message: "Webhook URL is required" },
      });
      return;
    }

    const result = await slackService.connectWebhook(userId, {
      webhookUrl,
      channelName,
      teamName,
    });

    res.json({
      success: true,
      data: result,
      message: "Slack webhook connected successfully",
    });
  }

  public static async testAlert(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const delivered = await slackService.sendTestAlert(userId);
    res.json({
      success: true,
      delivered,
      message: delivered
        ? "Test alert delivered to Slack"
        : "Failed to send test alert to webhook",
    });
  }

  public static async callback(req: Request, res: Response): Promise<void> {
    const { code, state, error } = req.query;

    if (error) {
      console.warn("[SLACK] OAuth error from Slack:", error);
      res.redirect(
        `${env.FRONTEND_URL}/?slack_error=${encodeURIComponent(String(error))}`,
      );
      return;
    }

    if (!code || !state) {
      res.redirect(`${env.FRONTEND_URL}/?slack_error=missing_code_or_state`);
      return;
    }

    // Extract userId from state
    const [userId] = String(state).split(":");
    if (!userId) {
      res.redirect(`${env.FRONTEND_URL}/?slack_error=invalid_state`);
      return;
    }

    try {
      await slackService.handleOAuthCallback(String(code), userId);
      res.redirect(`${env.FRONTEND_URL}/?slack=connected`);
    } catch (err: any) {
      console.error("[SLACK ERROR] OAuth exchange failed:", err.message);
      res.redirect(`${env.FRONTEND_URL}/?slack_error=exchange_failed`);
    }
  }

  public static async disconnect(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    await slackService.disconnect(userId);
    res.json({
      success: true,
      message: "Slack disconnected successfully",
    });
  }
}
