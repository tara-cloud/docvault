import { NextRequest, NextResponse } from "next/server";
import { BACKUP_DIR, UPLOAD_DIR, DB_PATH } from "@/lib/files";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

type Params = { params: Promise<{ name: string }> };

function safePath(name: string): string | null {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!name.startsWith("docvault-backup-") || !name.endsWith(".tar.gz")) return null;
  return path.join(BACKUP_DIR, name);
}

// GET /api/backup/[name] — download
export async function GET(_req: NextRequest, { params }: Params) {
  const { name } = await params;
  const filePath = safePath(name);
  if (!filePath) return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stream = fs.createReadStream(filePath);
  const webStream = new ReadableStream({
    start(c) {
      stream.on("data", (d) => c.enqueue(d));
      stream.on("end",  () => c.close());
      stream.on("error",(e) => c.error(e));
    },
  });
  const stat = fs.statSync(filePath);
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

// POST /api/backup/[name] — restore
export async function POST(_req: NextRequest, { params }: Params) {
  const { name } = await params;
  const filePath = safePath(name);
  if (!filePath) return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataDir = path.dirname(DB_PATH);
  try {
    // Extract to a temp dir first, then move into place
    const tmpDir = path.join(dataDir, ".restore-tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`tar -xzf "${filePath}" -C "${tmpDir}"`, { timeout: 60_000 });

    // Restore DB
    const srcDb = path.join(tmpDir, "docvault.db");
    if (fs.existsSync(srcDb)) fs.copyFileSync(srcDb, DB_PATH);

    // Restore uploads
    const srcUploads = path.join(tmpDir, "uploads");
    if (fs.existsSync(srcUploads)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      execSync(`cp -r "${srcUploads}/." "${UPLOAD_DIR}/"`, { timeout: 60_000 });
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
    return NextResponse.json({ ok: true, message: "Restore complete — please restart the app." });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/backup/[name] — delete backup file
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { name } = await params;
  const filePath = safePath(name);
  if (!filePath) return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return NextResponse.json({ ok: true });
}
