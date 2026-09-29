import { Router } from "express";
import { AuthController } from "./auth.controller.js";

export const authRouter = Router();

// Real Google OAuth 2.0 endpoints
authRouter.get("/google", AuthController.initiateGoogleAuth);
authRouter.get("/google/callback", AuthController.handleGoogleCallback);

// Session endpoints
authRouter.get("/me", AuthController.getMe);
authRouter.post("/logout", AuthController.logout);

// Safe testing endpoint (available in test & development)
authRouter.post("/test-login", AuthController.testLogin);
