import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeTags, parseTags, computeExpiry, humanSize } from "@/lib/utils";
import { ALLOWED_MIME, UPLOAD_DIR, docPath } from "@/lib/files";
import { randomUUID } from "crypto";
import formidable from "formidable";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: false } };

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
    if (folderId === "root" || folderId === "") where.folderId = null;
    else if (folderId) where.folderId = Number(folderId);
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

  const form = formidable({ maxFileSize: 50 * 1024 * 1024, keepExtensions: true });
  const nodeReq = req as unknown as Parameters<typeof form.parse>[0];
  const [fields, files] = await form.parse(nodeReq);

  const file = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext  = path.extname(file.originalFilename ?? "").toLowerCase();
  const mime = ALLOWED_MIME[ext];
  if (!mime) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });

  const id   = randomUUID();
  const dest = docPath(id, ext);
  fs.renameSync(file.filepath, dest);

  const f = (k: string) => (Array.isArray(fields[k]) ? fields[k][0] : fields[k]) ?? "";

  const doc = await prisma.document.create({
    data: {
      uuid:         id,
      originalName: file.originalFilename ?? "unknown",
      displayName:  f("display_name") || path.basename(file.originalFilename ?? "doc", ext),
      description:  f("description") || null,
      categoryId:   f("category_id") ? Number(f("category_id")) : 7,
      folderId:     f("folder_id") ? Number(f("folder_id")) : null,
      tags:         normalizeTags(f("tags")),
      fileExt:      ext,
      fileSize:     fs.statSync(dest).size,
      mimeType:     mime,
      expiryDate:   f("expiry_date") || null,
      uploadedAt:   new Date().toISOString(),
    },
    include: { category: true, folder: true },
  });

  return NextResponse.json(enrichDoc(doc), { status: 201 });
}
