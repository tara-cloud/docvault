import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseTags, normalizeTags } from "@/lib/utils";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id, vid } = await params;
  const docId = Number(id);
  const verId = Number(vid);

  const doc = await prisma.document.findUnique({
    where: { id: docId },
    include: { category: true, folder: true },
  });

  // Fetch version using raw SQL to avoid missing column errors
  type RawVer = { id: number; document_id: number; version_num: number; uuid: string; original_name: string; file_ext: string; file_size: number; mime_type: string; version_note: string | null; replaced_at: string; change_type?: string; snapshot?: string | null };
  const rows = await prisma.$queryRaw<RawVer[]>`
    SELECT id, document_id, version_num, uuid, original_name, file_ext, file_size, mime_type, version_note, replaced_at
    FROM document_versions WHERE id = ${verId} AND document_id = ${docId} LIMIT 1
  `;
  if (!doc || !rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ver = rows[0];
  // Try to get new columns if they exist
  try {
    const extended = await prisma.$queryRaw<{ change_type?: string; snapshot?: string | null }[]>`
      SELECT change_type, snapshot FROM document_versions WHERE id = ${verId} LIMIT 1
    `;
    if (extended.length) {
      ver.change_type = extended[0].change_type ?? "file";
      ver.snapshot    = extended[0].snapshot ?? null;
    }
  } catch { /* columns not yet migrated — default to file type */ }
  ver.change_type = ver.change_type ?? "file";

  const currentSnapshot = JSON.stringify({
    displayName:  doc.displayName,
    description:  doc.description,
    categoryId:   doc.categoryId,
    categoryName: doc.category.name,
    folderId:     doc.folderId,
    folderName:   doc.folder?.name ?? null,
    tags:         parseTags(doc.tags),
    expiryDate:   doc.expiryDate,
  });

  // Archive current as a version (with fallback for missing columns)
  const replacedAt = new Date().toISOString();
  try {
    await prisma.$executeRaw`
      INSERT INTO document_versions
        (document_id, version_num, uuid, original_name, file_ext, file_size, mime_type, version_note, change_type, snapshot, replaced_at)
      VALUES
        (${docId}, ${doc.versionNum}, ${doc.uuid}, ${doc.originalName}, ${doc.fileExt}, ${doc.fileSize}, ${doc.mimeType}, ${`Replaced by restore of v${ver.version_num}`}, ${"file"}, ${currentSnapshot}, ${replacedAt})
    `;
  } catch {
    await prisma.$executeRaw`
      INSERT INTO document_versions
        (document_id, version_num, uuid, original_name, file_ext, file_size, mime_type, version_note, replaced_at)
      VALUES
        (${docId}, ${doc.versionNum}, ${doc.uuid}, ${doc.originalName}, ${doc.fileExt}, ${doc.fileSize}, ${doc.mimeType}, ${`Replaced by restore of v${ver.version_num}`}, ${replacedAt})
    `;
  }

  const isMetadata = ver.change_type === "metadata";

  if (isMetadata && ver.snapshot) {
    type Snap = { displayName: string; description: string | null; categoryId: number; folderId: number | null; tags: string[]; expiryDate: string | null };
    const snap = JSON.parse(ver.snapshot) as Snap;
    await prisma.document.update({
      where: { id: docId },
      data: {
        displayName: snap.displayName,
        description: snap.description,
        categoryId:  snap.categoryId,
        folderId:    snap.folderId,
        tags:        normalizeTags(snap.tags.join(",")),
        expiryDate:  snap.expiryDate,
        uploadedAt:  new Date().toISOString(),
      },
    });
  } else {
    await prisma.document.update({
      where: { id: docId },
      data: {
        uuid:         ver.uuid,
        originalName: ver.original_name,
        fileExt:      ver.file_ext,
        fileSize:     ver.file_size,
        mimeType:     ver.mime_type,
        versionNum:   doc.versionNum + 1,
        uploadedAt:   new Date().toISOString(),
      },
    });
  }

  await prisma.documentVersion.delete({ where: { id: verId } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, vid } = await params;
  const rows = await prisma.$queryRaw<{ uuid: string; file_ext: string; change_type?: string }[]>`
    SELECT uuid, file_ext FROM document_versions WHERE id = ${Number(vid)} AND document_id = ${Number(id)} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ver = rows[0];
  if ((ver.change_type ?? "file") !== "metadata") {
    const { docPath } = await import("@/lib/files");
    const { default: fs } = await import("fs");
    try { fs.unlinkSync(docPath(ver.uuid, ver.file_ext)); } catch { /* already gone */ }
  }
  await prisma.documentVersion.delete({ where: { id: Number(vid) } });
  return NextResponse.json({ ok: true });
}
