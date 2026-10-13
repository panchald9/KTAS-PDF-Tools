import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const toolSettingsTable = pgTable("tool_settings", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  popular: boolean("popular").notNull().default(false),
});
export const siteSettingsTable = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
export const adPlacementsTable = pgTable("ad_placements", {
  name: text("name").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  type: text("type").notNull(),
  title: text("title").notNull().default(""),
  text: text("text").notNull().default(""),
  link: text("link").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  adUnit: text("ad_unit").notNull().default(""),
});
export const pageViewsTable = pgTable("page_views", {
  id: uuid("id").primaryKey(),
  visitor: text("visitor").notNull(),
  path: text("path").notNull(),
  ip: text("ip").notNull(),
  country: text("country").notNull(),
  device: text("device").notNull(),
  os: text("os").notNull(),
  browser: text("browser").notNull(),
  referrer: text("referrer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("page_views_created_at_idx").on(table.createdAt)]);

export const insertToolSettingsSchema = createInsertSchema(toolSettingsTable);
export const insertSiteSettingsSchema = createInsertSchema(siteSettingsTable);
export const insertAdPlacementSchema = createInsertSchema(adPlacementsTable);
export const insertPageViewSchema = createInsertSchema(pageViewsTable);
export type ToolSettings = z.infer<typeof insertToolSettingsSchema>;
export type SiteSettings = z.infer<typeof insertSiteSettingsSchema>;
export type AdPlacement = z.infer<typeof insertAdPlacementSchema>;
export type PageView = typeof pageViewsTable.$inferSelect;