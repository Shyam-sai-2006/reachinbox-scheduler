import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";

import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { getRedisClient } from "./queues/redis.js";
import { emailSendQueue } from "./queues/email.queue.js";
import { emailIndexQueue } from "./queues/index.queue.js";
import { elasticsearchService } from "./services/elasticsearch/elasticsearch.service.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";

export function createApp() {
  const app = express();

  // Security Middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow Bull Board dashboard assets & Vite frontend iframe
    }),
  );

  // CORS Middleware
  app.use(
    cors({
      origin: [
        env.FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "X-Requested-With",
      ],
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: `${env.MAX_UPLOAD_MB + 2}mb` }));
  app.use(
    express.urlencoded({ extended: true, limit: `${env.MAX_UPLOAD_MB + 2}mb` }),
  );

  // Session Store configuration
  const PgSession = connectPgSimple(session);
  const sessionStore = new PgSession({
    conString: env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: false,
  });

  app.use(
    session({
      store: sessionStore,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      },
    }),
  );

  // System Health & Readiness Endpoints (Requirement 82)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ready", async (_req: Request, res: Response) => {
    let dbOk = false;
    let redisOk = false;
    let esOk = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err: any) {
      dbOk = false;
    }

    try {
      const pong = await getRedisClient().ping();
      redisOk = pong === "PONG";
    } catch (err: any) {
      redisOk = false;
    }

    try {
      esOk = await elasticsearchService.checkHealth();
    } catch (err: any) {
      esOk = false;
    }

    const allReady = dbOk && redisOk;
    res.status(allReady ? 200 : 503).json({
      status: allReady ? "ready" : "unhealthy",
      database: dbOk,
      redis: redisOk,
      elasticsearch: esOk,
      timestamp: new Date().toISOString(),
    });
  });

  // Bull Board Integration (Requirement 33)
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(emailSendQueue) as any,
      new BullMQAdapter(emailIndexQueue) as any,
    ],
    serverAdapter,
  });

  // HTTP Basic Auth for Bull Board
  const basicAuthMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Bull Board Dashboard"');
      res.status(401).send("Authentication required");
      return;
    }

    const [scheme, credentials] = authHeader.split(" ");
    if (scheme !== "Basic" || !credentials) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Bull Board Dashboard"');
      res.status(401).send("Invalid credentials");
      return;
    }

    const decoded = Buffer.from(credentials, "base64").toString("utf8");
    const [user, pass] = decoded.split(":");

    if (user === env.BULL_BOARD_USER && pass === env.BULL_BOARD_PASSWORD) {
      next();
      return;
    }

    res.setHeader("WWW-Authenticate", 'Basic realm="Bull Board Dashboard"');
    res.status(401).send("Unauthorized");
  };

  app.use("/admin/queues", basicAuthMiddleware, serverAdapter.getRouter());

  // Mount API Router
  app.use("/api", apiRouter);

  // Serve static files from web frontend if built (unified deployment fallback)
  const candidatePaths = [
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(process.cwd(), "../../apps/web/dist"),
  ];

  for (const staticDir of candidatePaths) {
    if (fs.existsSync(staticDir)) {
      app.use(express.static(staticDir));
      app.get("*", (req: Request, res: Response, next: NextFunction) => {
        if (
          req.path.startsWith("/api") ||
          req.path.startsWith("/admin") ||
          req.path.startsWith("/health") ||
          req.path.startsWith("/ready")
        ) {
          return next();
        }
        res.sendFile(path.join(staticDir, "index.html"));
      });
      break;
    }
  }

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
