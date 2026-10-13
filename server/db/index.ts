import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "ktas.db");

interface SqliteStatement {
  all(...params: any[]): any[];
  get(...params: any[]): any;
  run(...params: any[]): any;
}

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

function initDatabase(filePath: string): SqliteDb {
  // Try built-in node:sqlite (Node 22+)
  try {
    const nodeSqlite = require("node:sqlite");
    if (nodeSqlite && nodeSqlite.DatabaseSync) {
      return new nodeSqlite.DatabaseSync(filePath) as SqliteDb;
    }
  } catch {
    // node:sqlite not available on Node 20 / older engines
  }

  // Fallback to better-sqlite3 (Node 20, 18, etc.)
  try {
    const BetterSqlite = require("better-sqlite3");
    return new BetterSqlite(filePath) as SqliteDb;
  } catch (err) {
    throw new Error(
      "No SQLite driver available. Please run `npm install better-sqlite3` or use Node.js 22+."
    );
  }
}

export const db: SqliteDb = initDatabase(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tool_settings (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    popular INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ad_placements (
    name TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    ad_unit TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS page_views (
    id TEXT PRIMARY KEY,
    visitor TEXT NOT NULL,
    path TEXT NOT NULL,
    ip TEXT NOT NULL,
    country TEXT NOT NULL,
    device TEXT NOT NULL,
    os TEXT NOT NULL,
    browser TEXT NOT NULL,
    referrer TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at);
`);

export interface ToolSettingRow {
  slug: string;
  name: string;
  description: string;
  enabled: number;
  popular: number;
}

export interface AdPlacementRow {
  name: string;
  enabled: number;
  type: string;
  title: string;
  text: string;
  link: string;
  image_url: string;
  ad_unit: string;
}

export interface PageViewRow {
  id: string;
  visitor: string;
  path: string;
  ip: string;
  country: string;
  device: string;
  os: string;
  browser: string;
  referrer: string;
  created_at: string;
}
