import { Router } from "express";
import { SenderController } from "./sender.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const senderRouter = Router();

senderRouter.get("/", requireAuth, SenderController.listSenders);
senderRouter.post("/", requireAuth, SenderController.createSender);
senderRouter.post("/test", requireAuth, SenderController.testSendEmail);
senderRouter.patch("/:id/toggle", requireAuth, SenderController.toggleActive);
senderRouter.delete("/:id", requireAuth, SenderController.deleteSender);
