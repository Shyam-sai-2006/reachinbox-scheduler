import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionUser = (req.session as any)?.user;
  let userId = sessionUser?.id || (req.session as any)?.userId;

  // Header token / User-Id fallback (useful in cross-site / proxy deployments)
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      userId = authHeader.substring(7).trim();
    }
  }

  if (!userId && req.headers["x-user-id"]) {
    userId = (req.headers["x-user-id"] as string).trim();
  }

  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required. Please log in or refresh your session.",
      },
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User session invalid. Please log in again.",
        },
      });
      return;
    }

    req.user = user;
    if (req.session) {
      (req.session as any).user = user;
      (req.session as any).userId = user.id;
    }
    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to verify session",
      },
    });
  }
}
