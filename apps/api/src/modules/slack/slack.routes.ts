import { Router } from "express";
import { SlackController } from "./slack.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const slackRouter = Router();

slackRouter.get("/status", requireAuth, SlackController.getStatus);
slackRouter.get("/connect", requireAuth, SlackController.connect);
slackRouter.post("/webhook", requireAuth, SlackController.connectWebhook);
slackRouter.post("/test-alert", requireAuth, SlackController.testAlert);
slackRouter.get("/callback", SlackController.callback);
slackRouter.delete("/", requireAuth, SlackController.disconnect);

