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
  const userId = sessionUser?.id || (req.session as any)?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required. Please log in with Google.",
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
