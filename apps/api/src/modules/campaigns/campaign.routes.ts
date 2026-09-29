import { Router } from "express";
import { CampaignController } from "./campaign.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const campaignRouter = Router();

campaignRouter.use(requireAuth);
campaignRouter.get("/", CampaignController.listCampaigns);
campaignRouter.get("/:id", CampaignController.getCampaignById);
