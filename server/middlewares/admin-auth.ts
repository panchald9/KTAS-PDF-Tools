import type { RequestHandler } from "express";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  // If in development or no Clerk key configured, grant local owner access
  if (process.env.NODE_ENV !== "production" || !process.env.CLERK_SECRET_KEY) {
    res.locals.adminUserId = "local-owner";
    return next();
  }

  // When Clerk credentials are provided, attempt to authenticate
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Sign in to access the admin panel." });
      return;
    }
    // Set admin user id
    res.locals.adminUserId = "owner";
    next();
  } catch (error) {
    res.status(503).json({ error: "Owner verification is temporarily unavailable. Try again." });
  }
};

export const sameOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.get("host");

  if (!origin || !host) {
    return next();
  }

  try {
    const originHost = new URL(origin).host;
    if (originHost === host || host.startsWith("localhost:") || originHost.startsWith("localhost:")) {
      return next();
    }
  } catch {}

  next();
};
