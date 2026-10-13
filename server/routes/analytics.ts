import { Router } from "express";
import { createHmac } from "node:crypto";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import { db } from "../db";
import { advertisingConfig, adminSettings } from "../lib/site-admin";
import { sameOrigin } from "../middlewares/admin-auth";

const router = Router();

router.get("/public-config", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await advertisingConfig());
});

router.post("/analytics/pageview", sameOrigin, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const settings = await adminSettings();
  if (!settings.analyticsEnabled || req.get("dnt") === "1" || req.get("sec-gpc") === "1") {
    res.sendStatus(204);
    return;
  }

  const ua = req.get("user-agent") ?? "";
  if (/bot|crawler|spider|headless|preview|facebookexternalhit|slurp|curl|wget/i.test(ua)) {
    res.sendStatus(204);
    return;
  }

  const { id, visitorId, path: pagePath, referrer: rawReferrer } = req.body || {};
  if (!id || !visitorId || !pagePath) {
    res.sendStatus(204);
    return;
  }

  const ip = (req.ip ?? "127.0.0.1").replace(/^::ffff:/, "");
  const secret = process.env.SESSION_SECRET || "ktas-session-secret-default";
  const visitor = createHmac("sha256", secret).update(String(visitorId)).digest("hex");
  const agent = new UAParser(ua).getResult();
  const code = geoip.lookup(ip)?.country;
  let country = "Unknown";
  if (code) {
    try {
      country = new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
    } catch {}
  }

  let referrer = "Direct";
  try {
    if (rawReferrer) referrer = new URL(rawReferrer).hostname;
  } catch {}

  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO page_views (id, visitor, path, ip, country, device, os, browser, referrer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      String(id),
      visitor,
      String(pagePath),
      ip,
      country,
      agent.device.type ?? "desktop",
      agent.os.name ?? "Unknown",
      agent.browser.name ?? "Unknown",
      referrer,
      new Date().toISOString()
    );
  } catch {}

  res.sendStatus(204);
});

export default router;
