import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { logger } from "../lib/logger";
import { adminMutationAllowed } from "../lib/admin-request-policy";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access the admin panel." }); return;
  }
  const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!owner) {
    res.status(503).json({ error: "The owner account has not been configured." }); return;
  }
  try {
    const user = await clerkClient.users.getUser(userId);
    const allowed = user.emailAddresses.some((email) =>
      email.emailAddress.toLowerCase() === owner && email.verification?.status === "verified",
    );
    if (!allowed) {
      res.status(403).json({ error: "Only the verified website owner can access this panel." }); return;
    }
    res.locals.adminUserId = userId;
    next();
  } catch (error) {
    logger.error({ err: error }, "Owner verification failed");
    res.status(503).json({ error: "Owner verification is temporarily unavailable. Try again." });
  }
};

// Non-browser clients and same-origin browser requests are supported. Reject
// cross-origin mutations even when an authenticated cookie is present.
export const sameOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.get("host");
  if (!adminMutationAllowed(origin, host, req.get("sec-fetch-site"))) {
    res.status(403).json({ error: "Cross-origin requests are not allowed." }); return;
  }
  next();
};