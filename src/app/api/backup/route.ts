import { NextRequest, NextResponse } from "next/server";
import { listBackups, createBackup, BACKUP_DIR } from "@/lib/files";
import { prisma } from "@/lib/db";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

export async function GET() {
  return NextResponse.json(listBackups());
}

export async function POST(req: NextRequest) {
  const { action } = await req.json().catch(() => ({})) as { action?: string };

  if (action === "restore") {
    // handled by named route below
    return NextResponse.json({ error: "Use /api/backup/[name] for restore" }, { status: 400 });
  }

  const keepSetting = await prisma.setting.findUnique({ where: { key: "backup_keep" } });
  const keep = Number(keepSetting?.value ?? "3");
  const name = await createBackup(keep);
  const size = listBackups().find(b => b.name === name)?.size ?? "";
  return NextResponse.json({ ok: true, name, size }, { status: 201 });
}
