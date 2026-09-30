import nodemailer from "nodemailer";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { encryptText, decryptText } from "../../utils/crypto.js";

export interface SmtpSenderConfig {
  email: string;
  displayName?: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export class SmtpService {
  /**
   * Initializes and seeds default Ethereal senders if none exist in DB
   */
  public async ensureSendersSeeded(): Promise<void> {
    const count = await prisma.emailSender.count();
    if (count >= 2) {
      return;
    }

    console.log("[SMTP] Initializing Ethereal sender identities...");
    let senderConfigs: SmtpSenderConfig[] = [];

    try {
      if (env.ETHEREAL_SENDERS_JSON && env.ETHEREAL_SENDERS_JSON !== "[]") {
        senderConfigs = JSON.parse(env.ETHEREAL_SENDERS_JSON);
      }
    } catch (err: any) {
      console.warn(
        "[SMTP WARN] Could not parse ETHEREAL_SENDERS_JSON:",
        err.message,
      );
    }

    // If fewer than 2 senders in JSON, generate real Ethereal test accounts dynamically
    while (senderConfigs.length < 2) {
      try {
        console.log(
          `[SMTP] Creating dynamic Ethereal test account ${senderConfigs.length + 1}...`,
        );
        const testAccount = await nodemailer.createTestAccount();
        senderConfigs.push({
          email: testAccount.user,
          displayName: `Ethereal Sender ${senderConfigs.length + 1}`,
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          user: testAccount.user,
          pass: testAccount.pass,
        });
      } catch (err: any) {
        console.error(
          "[SMTP ERROR] Failed to create Ethereal test account:",
          err.message,
        );
        break;
      }
    }

    for (const cfg of senderConfigs) {
      await prisma.emailSender.upsert({
        where: {
          id:
            (
              await prisma.emailSender.findFirst({
                where: { email: cfg.email },
              })
            )?.id || "00000000-0000-0000-0000-000000000000",
        },
        update: {
          email: cfg.email,
          displayName: cfg.displayName || cfg.email,
          smtpHost: cfg.host,
          smtpPort: cfg.port,
          smtpSecure: cfg.secure,
          smtpUsernameEncrypted: encryptText(cfg.user),
          smtpPasswordEncrypted: encryptText(cfg.pass),
          active: true,
        },
        create: {
          email: cfg.email,
          displayName: cfg.displayName || cfg.email,
          smtpHost: cfg.host,
          smtpPort: cfg.port,
          smtpSecure: cfg.secure,
          smtpUsernameEncrypted: encryptText(cfg.user),
          smtpPasswordEncrypted: encryptText(cfg.pass),
          active: true,
        },
      });
      console.log(
        `[SMTP] Configured sender: ${cfg.email} (${cfg.host}:${cfg.port})`,
      );
    }
    // Also seed real sender if REAL_SMTP_USER is provided in environment variables
    if (process.env.REAL_SMTP_USER && process.env.REAL_SMTP_PASS) {
      const realEmail =
        process.env.REAL_SMTP_FROM || process.env.REAL_SMTP_USER;
      const host = process.env.REAL_SMTP_HOST || "smtp.gmail.com";
      const port = Number(process.env.REAL_SMTP_PORT) || 587;
      const secure = process.env.REAL_SMTP_SECURE === "true";
      const displayName =
        process.env.REAL_SMTP_DISPLAY_NAME || "ReachInbox Live";

      const existingReal = await prisma.emailSender.findFirst({
        where: { email: realEmail },
      });

      await prisma.emailSender.upsert({
        where: {
          id: existingReal?.id || "00000000-0000-0000-0000-000000000001",
        },
        update: {
          email: realEmail,
          displayName,
          smtpHost: host,
          smtpPort: port,
          smtpSecure: secure,
          smtpUsernameEncrypted: encryptText(process.env.REAL_SMTP_USER),
          smtpPasswordEncrypted: encryptText(process.env.REAL_SMTP_PASS),
          active: true,
        },
        create: {
          email: realEmail,
          displayName,
          smtpHost: host,
          smtpPort: port,
          smtpSecure: secure,
          smtpUsernameEncrypted: encryptText(process.env.REAL_SMTP_USER),
          smtpPasswordEncrypted: encryptText(process.env.REAL_SMTP_PASS),
          active: true,
        },
      });
      console.log(
        `[SMTP] Real sender identity configured: ${realEmail} via ${host}:${port}`,
      );
    }
  }

  /**
   * Retrieves active senders.
   * If any real (non-Ethereal) active senders exist, prioritizes them so emails land in real inboxes!
   */
  public async getActiveSenders() {
    const realSenders = await prisma.emailSender.findMany({
      where: {
        active: true,
        smtpHost: { not: "smtp.ethereal.email" },
      },
      orderBy: { createdAt: "asc" },
    });

    if (realSenders.length > 0) {
      return realSenders;
    }

    return prisma.emailSender.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Retrieves all senders with real/mock status indicator
   */
  public async getAllSenders() {
    const senders = await prisma.emailSender.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    });

    return senders.map((s) => ({
      id: s.id,
      email: s.email,
      displayName: s.displayName,
      host: s.smtpHost,
      port: s.smtpPort,
      secure: s.smtpSecure,
      active: s.active,
      isRealSmtp: !s.smtpHost.includes("ethereal.email"),
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Verifies SMTP credentials live with the remote server
   */
  public async verifySmtpCredentials(config: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
  }): Promise<boolean> {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
      connectionTimeout: 10000,
    });

    try {
      await transporter.verify();
      return true;
    } catch (err: any) {
      throw new Error(
        `SMTP Connection verification failed (${config.host}:${config.port}): ${err.message}`,
      );
    }
  }

  /**
   * Creates or updates a verified sender identity
   */
  public async createSender(data: {
    email: string;
    displayName?: string;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    active?: boolean;
    userId?: string;
  }) {
    // 1. Verify connection credentials
    await this.verifySmtpCredentials({
      host: data.host,
      port: data.port,
      secure: data.secure,
      username: data.username,
      password: data.password,
    });

    const existing = await prisma.emailSender.findFirst({
      where: { email: data.email },
    });

    if (existing) {
      return prisma.emailSender.update({
        where: { id: existing.id },
        data: {
          displayName: data.displayName || data.email,
          smtpHost: data.host,
          smtpPort: data.port,
          smtpSecure: data.secure,
          smtpUsernameEncrypted: encryptText(data.username),
          smtpPasswordEncrypted: encryptText(data.password),
          active: data.active ?? true,
          userId: data.userId,
        },
      });
    }

    return prisma.emailSender.create({
      data: {
        email: data.email,
        displayName: data.displayName || data.email,
        smtpHost: data.host,
        smtpPort: data.port,
        smtpSecure: data.secure,
        smtpUsernameEncrypted: encryptText(data.username),
        smtpPasswordEncrypted: encryptText(data.password),
        active: data.active ?? true,
        userId: data.userId,
      },
    });
  }

  /**
   * Sends a live test email to verify mailbox receipt in real-time
   */
  public async sendTestEmail(params: {
    targetEmail: string;
    senderId?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    email?: string;
    displayName?: string;
  }): Promise<{ success: boolean; messageId?: string; previewUrl?: string | null }> {
    let transporter: nodemailer.Transporter;
    let senderEmail: string;
    let displayName: string | null = null;

    if (params.senderId) {
      const sender = await prisma.emailSender.findUnique({
        where: { id: params.senderId },
      });
      if (!sender) throw new Error("Sender not found");
      const user = decryptText(sender.smtpUsernameEncrypted);
      const pass = decryptText(sender.smtpPasswordEncrypted);
      senderEmail = sender.email;
      displayName = sender.displayName;
      transporter = nodemailer.createTransport({
        host: sender.smtpHost,
        port: sender.smtpPort,
        secure: sender.smtpSecure,
        auth: { user, pass },
        connectionTimeout: 10000,
      });
    } else if (
      params.host &&
      params.username &&
      params.password &&
      params.email
    ) {
      senderEmail = params.email;
      displayName = params.displayName || null;
      transporter = nodemailer.createTransport({
        host: params.host,
        port: params.port || 587,
        secure: params.secure || false,
        auth: { user: params.username, pass: params.password },
        connectionTimeout: 10000,
      });
    } else {
      const senders = await this.getActiveSenders();
      if (senders.length === 0) throw new Error("No active senders configured");
      const s = senders[0];
      const user = decryptText(s.smtpUsernameEncrypted);
      const pass = decryptText(s.smtpPasswordEncrypted);
      senderEmail = s.email;
      displayName = s.displayName;
      transporter = nodemailer.createTransport({
        host: s.smtpHost,
        port: s.smtpPort,
        secure: s.smtpSecure,
        auth: { user, pass },
        connectionTimeout: 10000,
      });
    }

    const fromHeader = displayName
      ? `"${displayName}" <${senderEmail}>`
      : senderEmail;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: params.targetEmail,
      subject: "ReachInbox Live Real Delivery Test 🚀",
      text: `Hello,\n\nThis is a real test email sent from ReachInbox to verify that your SMTP email sender (${senderEmail}) is active and operational!\n\nIf you see this in your inbox, live email delivery is working.\n\nTimestamp: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #4f46e5; margin-top: 0;">ReachInbox Live Delivery Verified 🚀</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.5;">Hello,</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.5;">This real test email confirms that your outgoing SMTP sender identity (<code>${senderEmail}</code>) is successfully configured and delivering live messages to real inboxes.</p>
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; border-radius: 8px; color: #166534; font-weight: 600; font-size: 13px; margin: 16px 0;">
            ✅ Live delivery confirmed to: <strong>${params.targetEmail}</strong>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">Dispatched via ReachInbox Email Scheduler at ${new Date().toLocaleString()}</p>
        </div>
      `,
    });

    const testUrl = nodemailer.getTestMessageUrl(info);
    return {
      success: true,
      messageId: info.messageId,
      previewUrl: typeof testUrl === "string" ? testUrl : null,
    };
  }

  /**
   * Toggles active state of a sender
   */
  public async toggleSenderActive(id: string) {
    const sender = await prisma.emailSender.findUnique({ where: { id } });
    if (!sender) throw new Error("Sender not found");

    return prisma.emailSender.update({
      where: { id },
      data: { active: !sender.active },
    });
  }

  /**
   * Deletes a sender
   */
  public async deleteSender(id: string) {
    return prisma.emailSender.delete({ where: { id } });
  }
}

export const smtpService = new SmtpService();
