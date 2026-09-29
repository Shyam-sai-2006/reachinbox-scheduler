import { Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";

export class AuthController {
  /**
   * Initiates Google OAuth 2.0 flow
   */
  public static async initiateGoogleAuth(
    req: Request,
    res: Response,
  ): Promise<void> {
    const state = crypto.randomBytes(16).toString("hex");
    (req.session as any).oauthState = state;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", env.GOOGLE_CALLBACK_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "select_account");

    res.redirect(authUrl.toString());
  }

  /**
   * Handles Google OAuth callback
   */
  public static async handleGoogleCallback(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { code, state, error } = req.query;

    if (error) {
      console.warn("[AUTH] Google OAuth error:", error);
      res.redirect(
        `${env.FRONTEND_URL}/?error=${encodeURIComponent(String(error))}`,
      );
      return;
    }

    const savedState = (req.session as any)?.oauthState;
    if (!state || !savedState || state !== savedState) {
      res.status(400).redirect(`${env.FRONTEND_URL}/?error=invalid_csrf_state`);
      return;
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code: String(code),
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_CALLBACK_URL,
          grant_type: "authorization_code",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );

      const { access_token } = tokenResponse.data;

      // Fetch user profile
      const userInfoResponse = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: { Authorization: `Bearer ${access_token}` },
        },
      );

      const profile = userInfoResponse.data;
      const googleId = profile.sub;
      const email = profile.email;
      const name = profile.name || profile.given_name || email.split("@")[0];
      const avatarUrl = profile.picture || null;

      // Find or create User in PostgreSQL
      const user = await prisma.user.upsert({
        where: { email },
        update: {
          googleId,
          name,
          avatarUrl,
          updatedAt: new Date(),
        },
        create: {
          googleId,
          email,
          name,
          avatarUrl,
        },
      });

      // Establish session
      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      };

      res.redirect(`${env.FRONTEND_URL}/`);
    } catch (err: any) {
      console.error(
        "[AUTH ERROR] Google callback failed:",
        err.response?.data || err.message,
      );
      res.redirect(`${env.FRONTEND_URL}/?error=auth_failed`);
    }
  }

  /**
   * Returns current authenticated user
   */
  public static async getMe(req: Request, res: Response): Promise<void> {
    const userId = (req.session as any)?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not found" },
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  }

  /**
   * Logs out current user and destroys session
   */
  public static async logout(req: Request, res: Response): Promise<void> {
    req.session.destroy((err) => {
      if (err) {
        console.error("[AUTH ERROR] Failed to destroy session:", err);
        res.status(500).json({
          success: false,
          error: { code: "LOGOUT_FAILED", message: "Logout failed" },
        });
        return;
      }
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Logged out successfully" });
    });
  }

  /**
   * Safe test authentication helper for automated testing or when Google OAuth credentials
   * are not yet provided in the environment.
   */
  public static async testLogin(req: Request, res: Response): Promise<void> {
    const targetEmail = req.body?.email || "demo.user@reachinbox.local";

    let user = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: `test-google-${Date.now()}`,
          email: targetEmail,
          name: req.body?.name || "Alex Demo",
          avatarUrl:
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&fit=crop&crop=face",
        },
      });
    }

    (req.session as any).userId = user.id;
    (req.session as any).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    });
  }
}
