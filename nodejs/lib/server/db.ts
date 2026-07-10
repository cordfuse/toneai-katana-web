// SQLite store for the free-tier quota.
//
// `node:sqlite` is used WITHOUT `--experimental-sqlite`: the flag is required
// on Node 22 but not on Node 24+, and this repo forbids experimental flags
// (see CLAUDE.md). docker/Dockerfile pins node:24-alpine for that reason.
// Do NOT reintroduce the flag, and do NOT swap in better-sqlite3 — a native
// addon is a heavier dependency than this needs.
//
// The only state here is one integer per UTC date. Everything else about a
// session lives in the browser.

import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data/katana.db')

// Skip DB initialisation during the Next.js build phase. Routes are
// force-dynamic and never execute their handlers at build time, but the
// module is still imported for static analysis — which would otherwise try
// to create a data/ directory inside the build image.
let db: DatabaseSync

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec(`
    -- Global free-tier counter. One row per UTC date; the date rolls the
    -- quota over implicitly, so there is no cron job to reset anything.
    CREATE TABLE IF NOT EXISTS daily_quota (
      date  TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );

    -- Per-device counter, same UTC-date rollover. Without this the global
    -- cap is a denial-of-service switch: one script drains the day's budget
    -- for every other user.
    CREATE TABLE IF NOT EXISTS device_quota (
      date      TEXT NOT NULL,
      device_id TEXT NOT NULL,
      count     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, device_id)
    );
  `)
} else {
  db = null as unknown as DatabaseSync
}

export default db
