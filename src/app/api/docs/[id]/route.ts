import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docPath } from "@/lib/files";
import { computeExpiry, humanSize, parseTags } from "@/lib/utils";
import fs from "fs";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Raw version row — only stable columns, new columns fetched with fallback
type RawVersion = {
  id: number; document_id: number; version_num: number;
  uuid: string; original_name: string; file_ext: string;
  file_size: number; mime_type: string; version_note: string | null;
  replaced_at: string;
  // New columns (may not exist yet — handled in JS)
  change_type?: string; snapshot?: string | null;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const doc = await prisma.document.findUnique({
      where: { id: Number(id) },
      include: { category: true, folder: true },
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fetch versions using raw SQL — only selects the stable columns
    // New columns (change_type, snapshot) are fetched separately with fallback
    let versions: RawVersion[] = [];
    try {
      versions = await prisma.$queryRaw`
        SELECT id, document_id, version_num, uuid, original_name,
               file_ext, file_size, mime_type, version_note, replaced_at,
               change_type, snapshot
        FROM document_versions
        WHERE document_id = ${Number(id)}
        ORDER BY version_num DESC
      `;
    } catch {
      // Columns don't exist yet — fetch without them
      versions = await prisma.$queryRaw`
        SELECT id, document_id, version_num, uuid, original_name,
               file_ext, file_size, mime_type, version_note, replaced_at
        FROM document_versions
        WHERE document_id = ${Number(id)}
        ORDER BY version_num DESC
      `;
    }

    const expiry = computeExpiry(doc.expiryDate);
    return NextResponse.json({
      ...doc,
      tagsList:        parseTags(doc.tags),
      fileSizeHuman:   humanSize(doc.fileSize),
      expiryStatus:    expiry.status,
      daysUntilExpiry: expiry.daysUntil,
      versions: versions.map(v => ({
        id:           v.id,
        documentId:   v.document_id,
        versionNum:   v.version_num,
        uuid:         v.uuid,
        originalName: v.original_name,
        fileExt:      v.file_ext,
        fileSize:     v.file_size,
        mimeType:     v.mime_type,
        versionNote:  v.version_note,
        replacedAt:   v.replaced_at,
        changeType:   v.change_type ?? "file",
        snapshot:     v.snapshot ?? null,
        fileSizeHuman: humanSize(Number(v.file_size)),
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    // Fetch doc without versions relation (avoids missing column error)
    const doc = await prisma.document.findUnique({ where: { id: Number(id) } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Get version file paths via raw SQL (stable columns only)
    const versions = await prisma.$queryRaw<{ uuid: string; file_ext: string }[]>`
      SELECT uuid, file_ext FROM document_versions WHERE document_id = ${Number(id)}
    `;

    // Delete version files from disk
    for (const v of versions) {
      try { fs.unlinkSync(docPath(v.uuid, v.file_ext)); } catch { /* already gone */ }
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
