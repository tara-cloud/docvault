#!/usr/bin/env node
// Runs on startup to add new columns to existing SQLite DB
// Safe to run multiple times (uses IF NOT EXISTS pattern via try/catch)

const { execSync } = require("child_process");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "/data/docvault.db";

try {
  const db = new Database(dbPath);
  // Add change_type column (default "file" for existing rows)
  try { db.exec(`ALTER TABLE document_versions ADD COLUMN change_type TEXT NOT NULL DEFAULT 'file'`); }
  catch { /* already exists */ }
  // Add snapshot column
  try { db.exec(`ALTER TABLE document_versions ADD COLUMN snapshot TEXT`); }
  catch { /* already exists */ }
  db.close();
  console.log("Migration complete.");
} catch (e) {
  console.error("Migration error (non-fatal):", e.message);
}
