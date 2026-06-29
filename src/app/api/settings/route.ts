import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hash, compare } from "bcryptjs";

export async function GET() {
  const keys   = ["theme", "backup_keep", "backup_hour"];
  const rows   = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map    = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return NextResponse.json({
    theme:       map.theme       ?? "dark",
    backupKeep:  Number(map.backup_keep  ?? "3"),
    backupHour:  Number(map.backup_hour  ?? "2"),
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    action?: string;
    currentPassword?: string;
    newPassword?: string;
    theme?: string;
    backupKeep?: number;
    backupHour?: number;
  };

  if (body.action === "change_password") {
    const stored = await prisma.setting.findUnique({ where: { key: "password_hash" } });
    let valid = false;
    if (stored) {
      valid = await compare(body.currentPassword ?? "", stored.value);
    } else {
      valid = (body.currentPassword ?? "") === (process.env.APP_PASSWORD ?? "changeme");
    }
    if (!valid) return NextResponse.json({ error: "Current password incorrect" }, { status: 401 });
    if ((body.newPassword ?? "").length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

    const newHash = await hash(body.newPassword!, 10);
    await prisma.setting.upsert({
      where:  { key: "password_hash" },
      create: { key: "password_hash", value: newHash },
      update: { value: newHash },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.theme !== undefined) {
    await prisma.setting.upsert({
      where: { key: "theme" }, create: { key: "theme", value: body.theme }, update: { value: body.theme },
    });
  }
  if (body.backupKeep !== undefined) {
    const v = String(Math.min(30, Math.max(1, body.backupKeep)));
    await prisma.setting.upsert({
      where: { key: "backup_keep" }, create: { key: "backup_keep", value: v }, update: { value: v },
    });
  }
  if (body.backupHour !== undefined) {
    const v = String(Math.min(23, Math.max(0, body.backupHour)));
    await prisma.setting.upsert({
      where: { key: "backup_hour" }, create: { key: "backup_hour", value: v }, update: { value: v },
    });
  }
  return NextResponse.json({ ok: true });
}
