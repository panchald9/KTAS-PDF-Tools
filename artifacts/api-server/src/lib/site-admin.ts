import { db, toolSettingsTable, siteSettingsTable, adPlacementsTable, pageViewsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { SaveAdminSettingsBody } from "@workspace/api-zod";
import { tools } from "./tool-catalog";
import { utilityTools } from "./utility-catalog";
import { wordTools } from "./word-tool-catalog";
import { excelTools } from "./excel-tool-catalog";
import { logger } from "./logger";

const popularSlugs = new Set(["merge-pdf", "split-pdf", "compress-pdf", "pdf-to-jpg", "jpg-to-pdf", "pdf-to-word", "sign-pdf", "edit-pdf"]);
export const adSlotNames = [
  "catalog-top", "catalog-quick-start", "catalog-directory-1", "catalog-directory-2", "catalog-directory-3", "catalog",
  "tool-top", "tool-sidebar", "tool-bottom", "guides-top", "guides-index", "guide-top", "guide-article",
  "hub-top", "hub-directory", "image-catalog", "text-catalog", "image-tool", "text-tool", "word-catalog", "word-tool", "excel-catalog", "excel-tool",
];
export async function managedTools() {
  const overrides = new Map((await db.select().from(toolSettingsTable)).map((row) => [row.slug, row]));
  return [...tools.map((tool) => ({ ...tool, section: "pdf" as const })), ...utilityTools, ...wordTools, ...excelTools].map((tool) => ({
    ...tool,
    ...(tool.slug === "ai-summarizer" ? {
      name: "Smart PDF Summary",
      description: "Pulls the most important sentences out of your document using local extractive ranking. It selects existing text and does not generate new wording.",
    } : {}),
    enabled: true, popular: tool.section === "pdf" ? popularSlugs.has(tool.slug) : !!tool.popular,
    ...overrides.get(tool.slug),
  }));
}
export async function adminSettings() {
  const [row] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "site"));
  return SaveAdminSettingsBody.parse(row?.value ?? { adsEnabled: false, adsPublisherId: "", analyticsEnabled: true });
}
export async function advertisingConfig() {
  const [settings, saved] = await Promise.all([adminSettings(), db.select().from(adPlacementsTable)]);
  return {
    settings,
    slots: adSlotNames.map((name) => saved.find((row) => row.name === name) ?? ({
      name, enabled: false, type: "sponsor" as const, title: "", text: "", link: "", imageUrl: "", adUnit: "",
    })),
  };
}
export async function expireVisitorData() {
  await db.delete(pageViewsTable).where(lt(pageViewsTable.createdAt, new Date(Date.now() - 30 * 86400_000)));
}
// Retention is enforced on reads and hourly, not just when an admin opens the dashboard.
const cleanup = setInterval(() => {
  expireVisitorData().catch((error) => logger.error({ err: error }, "Visitor retention cleanup failed"));
}, 3600_000);
cleanup.unref();