import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docPath } from "@/lib/files";
import { computeExpiry, humanSize, parseTags } from "@/lib/utils";
import fs from "fs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
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
      versions: doc.versions.map(v => ({
        ...v,
        fileSizeHuman: humanSize(v.fileSize),
        changeType: (v as { changeType?: string }).changeType ?? "file",
        snapshot:   (v as { snapshot?: string | null }).snapshot ?? null,
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const doc = await prisma.document.findUnique({
      where: { id: Number(id) },
      include: { versions: true },
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Delete all version files from disk
    for (const v of doc.versions) {
      try { fs.unlinkSync(docPath(v.uuid, v.fileExt)); } catch { /* already gone */ }
    }
    // Delete current file from disk
    try { fs.unlinkSync(docPath(doc.uuid, doc.fileExt)); } catch { /* ignore */ }

    await prisma.documentVersion.deleteMany({ where: { documentId: doc.id } });
    await prisma.document.delete({ where: { id: doc.id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
