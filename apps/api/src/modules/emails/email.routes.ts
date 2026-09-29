import { Router } from "express";
import { EmailController } from "./email.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { uploadEmailFile } from "../../middleware/upload.middleware.js";

export const emailRouter = Router();

emailRouter.use(requireAuth);

emailRouter.post("/schedule", uploadEmailFile, EmailController.scheduleEmails);
emailRouter.get("/", EmailController.listEmails);
emailRouter.get("/:id", EmailController.getEmailById);
emailRouter.post("/:id/cancel", EmailController.cancelEmail);
