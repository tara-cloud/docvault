import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// One-time migration endpoint — adds new columns to existing SQLite DB
// Safe to call multiple times (each ALTER is wrapped in try/catch)
export async function POST(_req: NextRequest) {
  const results: string[] = [];

  const migrations = [
    `ALTER TABLE document_versions ADD COLUMN change_type TEXT NOT NULL DEFAULT 'file'`,
    `ALTER TABLE document_versions ADD COLUMN snapshot TEXT`,
  ];

  for (const sql of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push(`✓ ${sql.split(" ").slice(0, 6).join(" ")}`);
    } catch {
      results.push(`⟳ already exists: ${sql.split(" ").slice(0, 6).join(" ")}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
