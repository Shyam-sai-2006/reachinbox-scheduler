import { Request, Response } from "express";
import { prisma } from "../../db/prisma.js";

export class CampaignController {
  public static async listCampaigns(
    req: Request,
    res: Response,
  ): Promise<void> {
    const userId = req.user!.id;

    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      include: {
        _count: {
          select: { emailMessages: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute status breakdowns
    const campaignStats = await prisma.emailMessage.groupBy({
      by: ["campaignId", "status"],
      where: { userId },
      _count: { id: true },
    });

    const statsMap: Record<
      string,
      { sent: number; failed: number; scheduled: number }
    > = {};
    for (const stat of campaignStats) {
      if (!statsMap[stat.campaignId]) {
        statsMap[stat.campaignId] = { sent: 0, failed: 0, scheduled: 0 };
      }
      if (stat.status === "sent")
        statsMap[stat.campaignId].sent += stat._count.id;
      else if (stat.status === "failed")
        statsMap[stat.campaignId].failed += stat._count.id;
      else if (stat.status === "scheduled")
        statsMap[stat.campaignId].scheduled += stat._count.id;
    }

    const items = campaigns.map((c) => ({
      id: c.id,
      userId: c.userId,
      subject: c.subject,
      body: c.body,
      startAt: c.startAt.toISOString(),
      delayMs: c.delayMs,
      hourlyLimit: c.hourlyLimit,
      totalEmails: c._count.emailMessages,
      sentEmails: statsMap[c.id]?.sent || 0,
      failedEmails: statsMap[c.id]?.failed || 0,
      scheduledEmails: statsMap[c.id]?.scheduled || 0,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    res.json({
      success: true,
      data: items,
    });
  }

  public static async getCampaignById(
    req: Request,
    res: Response,
  ): Promise<void> {
    const userId = req.user!.id;
    const { id } = req.params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, userId },
      include: {
        emailMessages: {
          orderBy: { sequenceNumber: "asc" },
          take: 100,
        },
      },
    });

    if (!campaign) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Campaign not found" },
      });
      return;
    }

    res.json({
      success: true,
      data: campaign,
    });
  }
}
