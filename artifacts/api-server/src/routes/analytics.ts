import { Router } from "express";
import { createHmac } from "node:crypto";
import { db, pageViewsTable } from "@workspace/db";
import geoip from "geoip-lite";
import UAParser from "ua-parser-js";
import { TrackPageViewBody } from "@workspace/api-zod";
import { adminSettings, managedTools, advertisingConfig } from "../lib/site-admin";
import { sameOrigin } from "../middlewares/admin-auth";

const router = Router();
router.get("/public-config", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await advertisingConfig());
});
const traffic = new Map<string, { count: number; expires: number }>();
router.post("/analytics/pageview", sameOrigin, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!(await adminSettings()).analyticsEnabled || req.get("dnt") === "1" || req.get("sec-gpc") === "1") {
    res.sendStatus(204); return;
  }
  const ua = req.get("user-agent") ?? "";
  if (/bot|crawler|spider|headless|preview|facebookexternalhit|slurp|curl|wget/i.test(ua)) { res.sendStatus(204); return; }
  const parsed = TrackPageViewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid consented page view is required." }); return; }
  const data = parsed.data;
   const known = ["/", "/tools", "/pdf", "/image", "/text", "/word", "/excel", "/guides", "/about", "/contact", "/privacy", "/terms", "/cookie-policy"];
  // Never store admin/auth paths, arbitrary URLs, query strings or document data.
  const path = data.path.replace(/\/$/, "") || "/";
   const publicTool = (await managedTools()).some((tool) => tool.enabled && (path === `/${tool.section}/${tool.slug}` || (tool.section === "pdf" && path === `/${tool.slug}`)));
  if (!known.includes(path) && !publicTool && !/^\/guides\/[a-z0-9-]+$/.test(path)) {
    res.status(400).json({ error: "This is not a public page." }); return;
  }
  const ip = (req.ip ?? "").replace(/^::ffff:/, "");
  const now = Date.now();
  for (const [key, bucket] of traffic) if (bucket.expires < now) traffic.delete(key);
  const bucket = traffic.get(ip) ?? { count: 0, expires: now + 60_000 };
  bucket.count++;
  traffic.set(ip, bucket);
  if (bucket.count > 60) { res.status(429).json({ error: "Too many page view requests." }); return; }
  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(503).json({ error: "Analytics privacy key is not configured." }); return; }
  const visitor = createHmac("sha256", secret).update(data.visitorId).digest("hex");
  const agent = new UAParser(ua).getResult();
  const code = geoip.lookup(ip)?.country;
  let country = "Unknown";
  if (code) country = new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  let referrer = "Direct";
  try { if (data.referrer) referrer = new URL(data.referrer).hostname; } catch { /* Invalid referrers are not retained. */ }
  await db.insert(pageViewsTable).values({
    id: data.id, visitor, path, ip, country,
    device: agent.device.type ?? "desktop", os: agent.os.name ?? "Unknown",
    browser: agent.browser.name ?? "Unknown", referrer,
  }).onConflictDoNothing({ target: pageViewsTable.id });
  res.sendStatus(204);
});
export default router;