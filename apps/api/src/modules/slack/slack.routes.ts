import { Router } from "express";
import { SlackController } from "./slack.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const slackRouter = Router();

slackRouter.get("/status", requireAuth, SlackController.getStatus);
slackRouter.get("/connect", requireAuth, SlackController.connect);
slackRouter.get("/callback", SlackController.callback);
slackRouter.delete("/", requireAuth, SlackController.disconnect);
