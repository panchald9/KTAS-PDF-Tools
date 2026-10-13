import { Router } from "express";
import { db, type PageViewRow } from "../db";
import { requireAdmin, sameOrigin } from "../middlewares/admin-auth";
import {
  adSlotNames,
  managedTools,
  advertisingConfig,
  saveAdminSettings,
  expireVisitorData,
} from "../lib/site-admin";

const router = Router();
router.use("/admin", requireAdmin, sameOrigin);

router.get("/admin/session", (_req, res) => {
  res.json({ userId: res.locals.adminUserId || "owner", role: "owner" });
});

router.get("/admin/tools", async (_req, res) => {
  res.json(await managedTools());
});

router.put("/admin/tools/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  const { name, description, enabled, popular } = req.body || {};
  if (!name?.trim() || !description?.trim()) {
    res.status(400).json({ error: "Enter a tool name and description." });
    return;
  }

  const all = await managedTools();
  if (!all.some((t) => t.slug === slug)) {
    res.status(404).json({ error: "This tool does not exist." });
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO tool_settings (slug, name, description, enabled, popular)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      enabled = excluded.enabled,
      popular = excluded.popular
  `);
  stmt.run(slug, name.trim(), description.trim(), enabled ? 1 : 0, popular ? 1 : 0);

  const updated = (await managedTools()).find((t) => t.slug === slug);
  res.json(updated);
});

router.delete("/admin/tools/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  const stmt = db.prepare("DELETE FROM tool_settings WHERE slug = ?");
  stmt.run(slug);
  const reset = (await managedTools()).find((t) => t.slug === slug);
  res.json(reset);
});

router.get("/admin/advertising", async (_req, res) => {
  res.json(await advertisingConfig());
});

router.put("/admin/settings", async (req, res) => {
  const { adsEnabled, adsPublisherId, analyticsEnabled } = req.body || {};
  const saved = await saveAdminSettings({
    adsEnabled: Boolean(adsEnabled),
    adsPublisherId: String(adsPublisherId || ""),
    analyticsEnabled: analyticsEnabled !== false,
  });
  res.json(saved);
});

router.put("/admin/ads/:name", async (req, res) => {
  const name = String(req.params.name);
  if (!adSlotNames.includes(name)) {
    res.status(400).json({ error: "Choose an existing placement." });
    return;
  }
  const { enabled, type, title, text, link, imageUrl, adUnit } = req.body || {};

  const stmt = db.prepare(`
    INSERT INTO ad_placements (name, enabled, type, title, text, link, image_url, ad_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      enabled = excluded.enabled,
      type = excluded.type,
      title = excluded.title,
      text = excluded.text,
      link = excluded.link,
      image_url = excluded.image_url,
      ad_unit = excluded.ad_unit
  `);
  stmt.run(
    name,
    enabled ? 1 : 0,
    type || "sponsor",
    title || "",
    text || "",
    link || "",
    imageUrl || "",
    adUnit || ""
  );

  res.json({ name, enabled: Boolean(enabled), type, title, text, link, imageUrl, adUnit });
});

router.delete("/admin/ads/:name", async (req, res) => {
  const name = String(req.params.name);
  const stmt = db.prepare("DELETE FROM ad_placements WHERE name = ?");
  stmt.run(name);
  res.sendStatus(204);
});

router.get("/admin/analytics", async (req, res) => {
  await expireVisitorData();
  const days = req.query.days === "7" ? 7 : 30;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const totalStmt = db.prepare(`
    SELECT
      count(*) as views,
      count(DISTINCT visitor) as visitors,
      count(CASE WHEN created_at >= ? THEN 1 END) as todayViews,
      count(DISTINCT CASE WHEN created_at >= ? THEN visitor END) as todayVisitors
    FROM page_views
    WHERE created_at >= ?
  `);
  const totals = totalStmt.get(todayIso, todayIso, cutoff) as any;

  // Daily totals
  const dailyStmt = db.prepare(`
    SELECT substr(created_at, 1, 10) as date, count(*) as views, count(DISTINCT visitor) as visitors
    FROM page_views
    WHERE created_at >= ?
    GROUP BY date
    ORDER BY date ASC
  `);
  const daily = dailyStmt.all(cutoff);

  const getBreakdown = (column: string) => {
    const s = db.prepare(`
      SELECT ${column} as label, count(*) as views, count(DISTINCT visitor) as visitors
      FROM page_views
      WHERE created_at >= ?
      GROUP BY ${column}
      ORDER BY views DESC
      LIMIT 100
    `);
    return s.all(cutoff);
  };

  res.json({
    totals: {
      views: totals?.views || 0,
      visitors: totals?.visitors || 0,
      todayViews: totals?.todayViews || 0,
      todayVisitors: totals?.todayVisitors || 0,
    },
    daily,
    countries: getBreakdown("country"),
    devices: getBreakdown("device"),
    operatingSystems: getBreakdown("os"),
    browsers: getBreakdown("browser"),
    pages: getBreakdown("path"),
    referrers: getBreakdown("referrer"),
    timezone: "UTC",
    retentionDays: 30,
  });
});

router.get("/admin/visitors", async (req, res) => {
  await expireVisitorData();
  const days = req.query.days === "7" ? 7 : 30;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  const countStmt = db.prepare("SELECT count(*) as total FROM page_views WHERE created_at >= ?");
  const countRow = countStmt.get(cutoff) as { total: number };

  const listStmt = db.prepare(`
    SELECT id, path, ip, country, device, os, browser, referrer, created_at as createdAt
    FROM page_views
    WHERE created_at >= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const records = listStmt.all(cutoff, pageSize, offset) as unknown as PageViewRow[];

  res.json({
    records,
    total: countRow?.total || 0,
    page,
    pageSize,
  });
});

router.delete("/admin/analytics", async (_req, res) => {
  db.prepare("DELETE FROM page_views").run();
  res.sendStatus(204);
});

export default router;
