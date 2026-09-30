import { Request, Response } from "express";
import {
  EmailSenderCreateSchema,
  EmailSenderTestSchema,
} from "@reachinbox/shared";
import { smtpService } from "../../services/smtp/smtp.service.js";

export class SenderController {
  /**
   * Lists all configured senders with real/mock delivery indicator
   */
  public static async listSenders(_req: Request, res: Response): Promise<void> {
    await smtpService.ensureSendersSeeded();
    const senders = await smtpService.getAllSenders();
    res.json({
      success: true,
      data: senders,
    });
  }

  /**
   * Adds or updates a real SMTP sender
   */
  public static async createSender(req: Request, res: Response): Promise<void> {
    const parseResult = EmailSenderCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            parseResult.error.errors[0]?.message || "Invalid sender settings",
        },
      });
      return;
    }

    try {
      const created = await smtpService.createSender({
        ...parseResult.data,
        userId: req.user?.id,
      });

      res.status(201).json({
        success: true,
        data: {
          id: created.id,
          email: created.email,
          displayName: created.displayName,
          host: created.smtpHost,
          port: created.smtpPort,
          secure: created.smtpSecure,
          active: created.active,
          isRealSmtp: !created.smtpHost.includes("ethereal.email"),
          createdAt: created.createdAt.toISOString(),
        },
        message: "Real SMTP sender verified and saved successfully!",
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: {
          code: "SMTP_VERIFY_FAILED",
          message: err.message || "Failed to verify SMTP credentials",
        },
      });
    }
  }

  /**
   * Sends a live test email to verify mailbox receipt immediately
   */
  public static async testSendEmail(
    req: Request,
    res: Response,
  ): Promise<void> {
    const parseResult = EmailSenderTestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            parseResult.error.errors[0]?.message ||
            "Valid recipient email is required for test send",
        },
      });
      return;
    }

    try {
      const result = await smtpService.sendTestEmail(parseResult.data);
      res.json({
        success: true,
        data: result,
        message: `Live test email dispatched to ${parseResult.data.targetEmail}!`,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: {
          code: "TEST_SEND_FAILED",
          message: err.message || "Failed to send live test email",
        },
      });
    }
  }

  /**
   * Toggles active state of a sender
   */
  public static async toggleActive(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const updated = await smtpService.toggleSenderActive(id);
      res.json({
        success: true,
        data: {
          id: updated.id,
          active: updated.active,
        },
        message: `Sender ${updated.active ? "activated" : "deactivated"}`,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
  }

  /**
   * Deletes a sender
   */
  public static async deleteSender(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      await smtpService.deleteSender(id);
      res.json({
        success: true,
        message: "Sender identity deleted successfully",
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
  }
}
