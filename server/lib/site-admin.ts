import { db, type ToolSettingRow, type AdPlacementRow } from "../db";
import { tools } from "../../shared/catalogs/tool-catalog";
import { utilityTools } from "../../shared/catalogs/utility-catalog";
import { wordTools } from "../../shared/catalogs/word-tool-catalog";
import { excelTools } from "../../shared/catalogs/excel-tool-catalog";
import type { PdfTool } from "../../shared/types";

const popularSlugs = new Set([
  "merge-pdf", "split-pdf", "compress-pdf", "pdf-to-jpg",
  "jpg-to-pdf", "pdf-to-word", "sign-pdf", "edit-pdf"
]);

export const adSlotNames = [
  "catalog-top", "catalog-quick-start", "catalog-directory-1", "catalog-directory-2", "catalog-directory-3", "catalog",
  "tool-top", "tool-sidebar", "tool-bottom", "guides-top", "guides-index", "guide-top", "guide-article",
  "hub-top", "hub-directory", "image-catalog", "text-catalog", "image-tool", "text-tool", "word-catalog", "word-tool", "excel-catalog", "excel-tool",
];

export function getToolOverrides(): Map<string, ToolSettingRow> {
  const stmt = db.prepare("SELECT * FROM tool_settings");
  const rows = stmt.all() as unknown as ToolSettingRow[];
  return new Map(rows.map((row) => [row.slug, row]));
}

export async function managedTools(): Promise<PdfTool[]> {
  const overrides = getToolOverrides();
  const allTools = [
    ...tools.map((tool) => ({ ...tool, section: "pdf" as const })),
    ...utilityTools,
    ...wordTools,
    ...excelTools,
  ];

  return allTools.map((tool) => {
    const override = overrides.get(tool.slug);
    const enabled = override ? Boolean(override.enabled) : true;
    const popular = override
      ? Boolean(override.popular)
      : (tool.section === "pdf" ? popularSlugs.has(tool.slug) : Boolean(tool.popular));
    const name = override?.name || tool.name;
    const description = override?.description || tool.description;

    return {
      ...tool,
      name,
      description,
      enabled,
      popular,
    };
  });
}

export interface SiteSettingsData {
  adsEnabled: boolean;
  adsPublisherId: string;
  analyticsEnabled: boolean;
}

export async function adminSettings(): Promise<SiteSettingsData> {
  const stmt = db.prepare("SELECT value FROM site_settings WHERE key = 'site'");
  const row = stmt.get() as { value: string } | undefined;
  if (!row) {
    return { adsEnabled: false, adsPublisherId: "", analyticsEnabled: true };
  }
  try {
    return JSON.parse(row.value);
  } catch {
    return { adsEnabled: false, adsPublisherId: "", analyticsEnabled: true };
  }
}

export async function saveAdminSettings(data: SiteSettingsData): Promise<SiteSettingsData> {
  const stmt = db.prepare(`
    INSERT INTO site_settings (key, value)
    VALUES ('site', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(JSON.stringify(data));
  return data;
}

export interface AdPlacementData {
  name: string;
  enabled: boolean;
  type: "sponsor" | "adsense";
  title: string;
  text: string;
  link: string;
  imageUrl: string;
  adUnit: string;
}

export async function advertisingConfig() {
  const settings = await adminSettings();
  const stmt = db.prepare("SELECT * FROM ad_placements");
  const rows = stmt.all() as unknown as AdPlacementRow[];
  const savedMap = new Map(rows.map(r => [r.name, r]));

  const slots = adSlotNames.map((name) => {
    const row = savedMap.get(name);
    if (!row) {
      return {
        name,
        enabled: false,
        type: "sponsor" as const,
        title: "",
        text: "",
        link: "",
        imageUrl: "",
        adUnit: "",
      };
    }
    return {
      name,
      enabled: Boolean(row.enabled),
      type: (row.type === "adsense" ? "adsense" : "sponsor") as "sponsor" | "adsense",
      title: row.title || "",
      text: row.text || "",
      link: row.link || "",
      imageUrl: row.image_url || "",
      adUnit: row.ad_unit || "",
    };
  });

  return { settings, slots };
}

export async function expireVisitorData() {
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const stmt = db.prepare("DELETE FROM page_views WHERE created_at < ?");
  stmt.run(cutoff);
}

// Hourly cleanup
const cleanup = setInterval(() => {
  expireVisitorData().catch(() => {});
}, 3600_000);
cleanup.unref();
