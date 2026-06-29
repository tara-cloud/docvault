import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseTags, normalizeTags } from "@/lib/utils";

type Params = { params: Promise<{ id: string; vid: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id, vid } = await params;
  const docId = Number(id);
  const verId = Number(vid);

  const doc = await prisma.document.findUnique({
    where: { id: docId },
    include: { category: true, folder: true },
  });
  const ver = await prisma.documentVersion.findUnique({ where: { id: verId } });
  if (!doc || !ver || ver.documentId !== docId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Snapshot current state before restore
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

  // Archive current as a version before restoring
  await prisma.documentVersion.create({
    data: {
      documentId:   docId,
      versionNum:   doc.versionNum,
      uuid:         doc.uuid,
      originalName: doc.originalName,
      fileExt:      doc.fileExt,
      fileSize:     doc.fileSize,
      mimeType:     doc.mimeType,
      versionNote:  `Replaced by restore of v${ver.versionNum}`,
      changeType:   "file",
      snapshot:     currentSnapshot,
      replacedAt:   new Date().toISOString(),
    },
  });

  const isMetadata = ver.changeType === "metadata";

  if (isMetadata && ver.snapshot) {
    // Restore metadata from snapshot
    type Snap = {
      displayName: string; description: string | null;
      categoryId: number; folderId: number | null;
      tags: string[]; expiryDate: string | null;
    };
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
    // Restore file version
    await prisma.document.update({
      where: { id: docId },
      data: {
        uuid:         ver.uuid,
        originalName: ver.originalName,
        fileExt:      ver.fileExt,
        fileSize:     ver.fileSize,
        mimeType:     ver.mimeType,
        versionNum:   doc.versionNum + 1,
        uploadedAt:   new Date().toISOString(),
      },
    });
  }

  // Remove the restored version entry from history
  await prisma.documentVersion.delete({ where: { id: verId } });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, vid } = await params;
  const ver = await prisma.documentVersion.findUnique({ where: { id: Number(vid) } });
  if (!ver || ver.documentId !== Number(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Delete the version file from disk if it's a file version
  if (ver.changeType !== "metadata") {
    const { docPath } = await import("@/lib/files");
    const { default: fs } = await import("fs");
    try { fs.unlinkSync(docPath(ver.uuid, ver.fileExt)); } catch { /* already gone */ }
  }
  await prisma.documentVersion.delete({ where: { id: Number(vid) } });
  return NextResponse.json({ ok: true });
}
