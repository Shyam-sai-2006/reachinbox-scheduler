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
  }

  /**
   * Retrieves all active senders
   */
  public async getActiveSenders() {
    return prisma.emailSender.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const smtpService = new SmtpService();
