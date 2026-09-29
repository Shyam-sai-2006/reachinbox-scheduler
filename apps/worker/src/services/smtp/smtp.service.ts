import nodemailer from "nodemailer";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { decryptText } from "../../utils/crypto.js";

export interface SendEmailParams {
  emailMessageId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
}

export class WorkerSmtpService {
  private transporterCache: Map<string, nodemailer.Transporter> = new Map();

  /**
   * Gets or creates a cached Nodemailer transporter for a sender
   */
  private async getTransporter(
    senderId: string,
  ): Promise<{ transporter: nodemailer.Transporter; senderEmail: string }> {
    const sender = await prisma.emailSender.findUnique({
      where: { id: senderId },
    });

    if (!sender) {
      throw new Error(`Email sender not found: ${senderId}`);
    }

    if (!this.transporterCache.has(senderId)) {
      const user = decryptText(sender.smtpUsernameEncrypted);
      const pass = decryptText(sender.smtpPasswordEncrypted);

      const transporter = nodemailer.createTransport({
        host: sender.smtpHost,
        port: sender.smtpPort,
        secure: sender.smtpSecure,
        auth: {
          user,
          pass,
        },
        connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
        socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
        pool: true,
        maxConnections: 5,
      });

      this.transporterCache.set(senderId, transporter);
    }

    return {
      transporter: this.transporterCache.get(senderId)!,
      senderEmail: sender.email,
    };
  }

  /**
   * Sends an email via Nodemailer with deterministic Message-ID and captures Ethereal preview URL
   */
  public async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const { transporter, senderEmail } = await this.getTransporter(
      params.senderId,
    );

    const deterministicMessageId = `<email-message-${params.emailMessageId}@reachinbox.local>`;

    try {
      const info = await transporter.sendMail({
        from: senderEmail,
        to: params.recipient,
        subject: params.subject,
        text: params.body,
        messageId: deterministicMessageId,
        headers: {
          "X-ReachInbox-Message-ID": params.emailMessageId,
        },
      });

      const previewUrl = nodemailer.getTestMessageUrl(info) || null;

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: typeof previewUrl === "string" ? previewUrl : null,
      };
    } catch (err: any) {
      console.error(
        `[SMTP ERROR] Failed to send email ${params.emailMessageId} to ${params.recipient}:`,
        err.message,
      );
      return {
        success: false,
        error: err.message || "SMTP transmission failure",
      };
    }
  }
}

export const workerSmtpService = new WorkerSmtpService();
