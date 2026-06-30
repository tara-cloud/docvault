import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeTags, parseTags, computeExpiry, humanSize } from "@/lib/utils";
import { getMimeType, UPLOAD_DIR, docPath } from "@/lib/files";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// Force Node.js runtime for this route — enables large file uploads via req.formData()
export const runtime = "nodejs";

function enrichDoc(doc: {
  id: number; uuid: string; originalName: string; displayName: string;
  description: string | null; fileExt: string; fileSize: number; mimeType: string;
  expiryDate: string | null; uploadedAt: string; versionNum: number; tags: string | null;
  category: { id: number; name: string; icon: string };
  folder: { id: number; name: string } | null;
}) {
  const expiry = computeExpiry(doc.expiryDate);
  return {
    ...doc,
    tagsList:       parseTags(doc.tags),
    fileSizeHuman:  humanSize(doc.fileSize),
    expiryStatus:   expiry.status,
    daysUntilExpiry: expiry.daysUntil,
  };
}

// GET /api/docs — list / search documents
export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const q          = sp.get("q") ?? "";
  const categoryId = sp.get("category_id") ? Number(sp.get("category_id")) : undefined;
  const tag        = sp.get("tag") ?? "";
  const expFilter  = sp.get("expiry_filter") ?? "";
  const folderId   = sp.get("folder_id");

  const today = new Date().toISOString().slice(0, 10);
  const in90  = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { displayName:  { contains: q } },
      { description:  { contains: q } },
      { tags:         { contains: q } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (tag)        where.tags = { contains: `,${tag},` };

  if (expFilter === "expired")  where.expiryDate = { not: null, lt: today };
  if (expFilter === "expiring") {
    where.expiryDate = { not: null, gte: today, lte: in90 };
  }

  const searching = !!(q || categoryId || tag || expFilter);
  if (!searching) {
    // null (no param) or "" or "root" all mean: show root-level docs only
    if (!folderId || folderId === "" || folderId === "root") {
      where.folderId = null;
    } else {
      where.folderId = Number(folderId);
    }
  }

  const docs = await prisma.document.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
    include: { category: true, folder: true },
  });

  // Stats
  const total          = await prisma.document.count();
  const expiredCount   = await prisma.document.count({ where: { expiryDate: { not: null, lt: today } } });
  const expiringCount  = await prisma.document.count({ where: { expiryDate: { not: null, gte: today, lte: in90 } } });

  // Subfolders
  const parentId = folderId && folderId !== "root" && folderId !== "" ? Number(folderId) : null;
  const subfolders = searching ? [] : await prisma.folder.findMany({
    where: { parentId },
    include: { _count: { select: { documents: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    docs:          docs.map(enrichDoc),
    total,
    expiredCount,
    expiringCount,
    subfolders:    subfolders.map(f => ({ ...f, docCount: f._count.documents })),
  });
}

// POST /api/docs — upload new document
export async function POST(req: NextRequest) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  let dest: string | null = null;
  try {
    const formData = await req.formData();
    const fileEntry = formData.get("file");
    if (!fileEntry || typeof fileEntry === "string") {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    const file = fileEntry as File;

    const ext  = path.extname(file.name).toLowerCase() || ".bin";
    const mime = getMimeType(ext);
    // No file type restriction — accept any format

    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 100 MB limit" }, { status: 413 });
    }

    const id = randomUUID();
    dest = docPath(id, ext);

    // Stream file to disk instead of buffering entire file in RAM
    // This avoids OOM on the Pi when uploading large files
    const fileStream = file.stream();
    const writeStream = fs.createWriteStream(dest);
    const reader = fileStream.getReader();
    await new Promise<void>((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);
      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) { writeStream.end(); return; }
          writeStream.write(value, (err) => { if (err) reject(err); else pump(); });
        }).catch(reject);
      }
      pump();
    });
    const fileSize = fs.statSync(dest).size;

    const f = (k: string) => {
      const v = formData.get(k);
      return typeof v === "string" ? v : "";
    };

    const doc = await prisma.document.create({
      data: {
        uuid:         id,
        originalName: file.name,
        displayName:  f("display_name") || path.basename(file.name, ext),
        description:  f("description") || null,
        categoryId:   f("category_id") ? Number(f("category_id")) : 7,
        folderId:     f("folder_id") ? Number(f("folder_id")) : null,
        tags:         normalizeTags(f("tags")),
        fileExt:      ext,
        fileSize:     fileSize,
        mimeType:     mime,
        expiryDate:   f("expiry_date") || null,
        uploadedAt:   new Date().toISOString(),
      },
      include: { category: true, folder: true },
    });

    return NextResponse.json(enrichDoc(doc), { status: 201 });
  } catch (e: unknown) {
    if (dest) try { fs.unlinkSync(dest); } catch { /* ignore */ }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
