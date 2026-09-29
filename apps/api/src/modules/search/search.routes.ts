import { Router } from "express";
import { SearchController } from "./search.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const searchRouter = Router();

searchRouter.use(requireAuth);
searchRouter.get("/", SearchController.search);
