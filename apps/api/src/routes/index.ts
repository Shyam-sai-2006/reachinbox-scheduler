import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { emailRouter } from "../modules/emails/email.routes.js";
import { searchRouter } from "../modules/search/search.routes.js";
import { campaignRouter } from "../modules/campaigns/campaign.routes.js";
import { slackRouter } from "../modules/slack/slack.routes.js";
import { senderRouter } from "../modules/senders/sender.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/emails/search", searchRouter);
apiRouter.use("/emails", emailRouter);
apiRouter.use("/campaigns", campaignRouter);
apiRouter.use("/integrations/slack", slackRouter);
apiRouter.use("/senders", senderRouter);

