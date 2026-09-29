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
    const state = `${userId}:${crypto.randomBytes(16).toString("hex")}`;
    (req.session as any).slackOAuthState = state;

    const authUrl = slackService.getAuthorizationUrl(state);
    res.redirect(authUrl);
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
