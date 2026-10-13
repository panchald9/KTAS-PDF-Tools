import { Router } from "express";
import { db, pool, toolSettingsTable, siteSettingsTable, adPlacementsTable, pageViewsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SaveAdminToolBody, SaveAdminSettingsBody, SaveAdminAdBody, ClearAdminAnalyticsBody } from "@workspace/api-zod";
import { requireAdmin, sameOrigin } from "../middlewares/admin-auth";
import { adSlotNames, managedTools, advertisingConfig, adminSettings, expireVisitorData } from "../lib/site-admin";

const router = Router();
router.use("/admin", requireAdmin, sameOrigin);
router.get("/admin/session", (_req, res) => res.json({ userId: res.locals.adminUserId, role: "owner" }));
router.get("/admin/tools", async (_req, res) => res.json(await managedTools()));
router.put("/admin/tools/:slug", async (req, res) => {
  const parsed = SaveAdminToolBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.name.trim() || !parsed.data.description.trim()) {
    res.status(400).json({ error: "Enter a tool name and description within the allowed lengths." }); return;
  }
  const slug = String(req.params.slug);
  if (!(await managedTools()).some((tool) => tool.slug === slug)) {
    res.status(404).json({ error: "This tool does not exist." }); return;
  }
  const values = { ...parsed.data, name: parsed.data.name.trim(), description: parsed.data.description.trim() };
  await db.insert(toolSettingsTable).values({ slug, ...values }).onConflictDoUpdate({ target: toolSettingsTable.slug, set: values });
  res.json((await managedTools()).find((tool) => tool.slug === slug));
});
router.delete("/admin/tools/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  if (!(await managedTools()).some((tool) => tool.slug === slug)) {
    res.status(404).json({ error: "This tool does not exist." }); return;
  }
  await db.delete(toolSettingsTable).where(eq(toolSettingsTable.slug, slug));
  res.json((await managedTools()).find((tool) => tool.slug === slug));
});
router.get("/admin/advertising", async (_req, res) => res.json(await advertisingConfig()));
router.put("/admin/settings", async (req, res) => {
  const parsed = SaveAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Use a valid AdSense publisher ID (ca-pub- followed by 16 digits), or leave it empty." }); return; }
  await db.insert(siteSettingsTable).values({ key: "site", value: parsed.data }).onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: parsed.data } });
  res.json(parsed.data);
});
function secureUrl(value: string) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
router.put("/admin/ads/:name", async (req, res) => {
  const name = String(req.params.name);
  const parsed = SaveAdminAdBody.safeParse(req.body);
  if (!adSlotNames.includes(name) || !parsed.success) {
    res.status(400).json({ error: "Choose an existing placement and valid ad fields." }); return;
  }
  const data = parsed.data;
  if (!secureUrl(data.link) || !secureUrl(data.imageUrl) ||
      (data.enabled && data.type === "sponsor" && (!data.title.trim() || !data.link)) ||
      (data.enabled && data.type === "adsense" && !data.adUnit)) {
    res.status(400).json({ error: "Active sponsors need a title and HTTPS link. Active AdSense ads need a 10-digit ad unit. Images must use HTTPS." }); return;
  }
  if (data.enabled && data.type === "adsense" && !(await adminSettings()).adsPublisherId) {
    res.status(400).json({ error: "Save your AdSense publisher ID in Settings before enabling an AdSense placement." }); return;
  }
  await db.insert(adPlacementsTable).values({ name, ...data }).onConflictDoUpdate({ target: adPlacementsTable.name, set: data });
  res.json({ name, ...data });
});
router.delete("/admin/ads/:name", async (req, res) => {
  const name = String(req.params.name);
  if (!adSlotNames.includes(name)) { res.status(404).json({ error: "Unknown ad placement." }); return; }
  await db.delete(adPlacementsTable).where(eq(adPlacementsTable.name, name));
  res.sendStatus(204);
});
const timezone = "Asia/Kolkata";
function daysValue(raw: unknown) { return String(raw) === "7" ? 7 : 30; }
// Calendar periods include today in the reporting timezone, plus the prior N-1 days.
const startSql = "(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - ($1::int - 1) * interval '1 day') AT TIME ZONE 'Asia/Kolkata'";
router.get("/admin/analytics", async (req, res) => {
  await expireVisitorData();
  const days = daysValue(req.query.days);
  const [totals, daily, ...breakdowns] = await Promise.all([
    pool.query(`SELECT count(*)::int AS views, count(DISTINCT visitor)::int AS visitors,
      count(*) FILTER (WHERE created_at AT TIME ZONE '${timezone}' >= date_trunc('day', now() AT TIME ZONE '${timezone}'))::int AS "todayViews",
      count(DISTINCT visitor) FILTER (WHERE created_at AT TIME ZONE '${timezone}' >= date_trunc('day', now() AT TIME ZONE '${timezone}'))::int AS "todayVisitors"
      FROM page_views WHERE created_at >= ${startSql}`, [days]),
    pool.query(`SELECT to_char(day, 'YYYY-MM-DD') AS date, count(p.id)::int AS views, count(DISTINCT p.visitor)::int AS visitors
      FROM generate_series((now() AT TIME ZONE '${timezone}')::date - ($1::int - 1), (now() AT TIME ZONE '${timezone}')::date, '1 day') AS day
      LEFT JOIN page_views p ON (p.created_at AT TIME ZONE '${timezone}')::date = day::date
      GROUP BY day ORDER BY day`, [days]),
    ...["country", "device", "os", "browser", "path", "referrer"].map((column) =>
      pool.query(`SELECT ${column} AS label, count(*)::int AS views, count(DISTINCT visitor)::int AS visitors
        FROM page_views WHERE created_at >= ${startSql} GROUP BY ${column} ORDER BY views DESC, label LIMIT 100`, [days]),
    ),
  ]);
  res.json({
    totals: totals.rows[0], daily: daily.rows,
    countries: breakdowns[0]!.rows, devices: breakdowns[1]!.rows, operatingSystems: breakdowns[2]!.rows,
    browsers: breakdowns[3]!.rows, pages: breakdowns[4]!.rows, referrers: breakdowns[5]!.rows,
    timezone, retentionDays: 30,
  });
});
router.get("/admin/visitors", async (req, res) => {
  await expireVisitorData();
  const days = daysValue(req.query.days);
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page), 10) || 1));
  const pageSize = 25;
  const [records, count] = await Promise.all([
    pool.query(`SELECT id, path, ip, country, device, os, browser, referrer, created_at AS "createdAt"
      FROM page_views WHERE created_at >= ${startSql} ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [days, pageSize, (page - 1) * pageSize]),
    pool.query(`SELECT count(*)::int AS total FROM page_views WHERE created_at >= ${startSql}`, [days]),
  ]);
  res.json({ records: records.rows, total: count.rows[0].total, page, pageSize });
});
router.delete("/admin/analytics", async (req, res) => {
  if (!ClearAdminAnalyticsBody.safeParse(req.body).success) {
    res.status(400).json({ error: "Confirm DELETE to permanently clear visitor records." }); return;
  }
  await db.delete(pageViewsTable);
  res.sendStatus(204);
});
export default router;