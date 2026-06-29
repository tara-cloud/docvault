import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docPath } from "@/lib/files";
import { computeExpiry, humanSize, parseTags } from "@/lib/utils";
import fs from "fs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id: Number(id) },
    include: { category: true, folder: true, versions: { orderBy: { versionNum: "desc" } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const expiry = computeExpiry(doc.expiryDate);
  return NextResponse.json({
    ...doc,
    tagsList:        parseTags(doc.tags),
    fileSizeHuman:   humanSize(doc.fileSize),
    expiryStatus:    expiry.status,
    daysUntilExpiry: expiry.daysUntil,
    versions: doc.versions.map(v => ({ ...v, fileSizeHuman: humanSize(v.fileSize) })),
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id: Number(id) },
    include: { versions: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete all version files
  for (const v of doc.versions) {
    const p = docPath(v.uuid, v.fileExt);
    try { fs.unlinkSync(p); } catch { /* already gone */ }
  }
  // Delete current file
  try { fs.unlinkSync(docPath(doc.uuid, doc.fileExt)); } catch { /* ignore */ }

  await prisma.documentVersion.deleteMany({ where: { documentId: doc.id } });
  await prisma.document.delete({ where: { id: doc.id } });
  return NextResponse.json({ ok: true });
}
