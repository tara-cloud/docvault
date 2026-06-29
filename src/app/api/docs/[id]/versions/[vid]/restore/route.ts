import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string; vid: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id, vid } = await params;
  const docId = Number(id);
  const verId = Number(vid);

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  const ver = await prisma.documentVersion.findUnique({ where: { id: verId } });
  if (!doc || !ver || ver.documentId !== docId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Archive current as a version
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
      replacedAt:   new Date().toISOString(),
    },
  });

  // Promote old version to current
  const newVersionNum = doc.versionNum + 1;
  await prisma.document.update({
    where: { id: docId },
    data: {
      uuid:         ver.uuid,
      originalName: ver.originalName,
      fileExt:      ver.fileExt,
      fileSize:     ver.fileSize,
      mimeType:     ver.mimeType,
      versionNum:   newVersionNum,
      uploadedAt:   new Date().toISOString(),
    },
  });

  // Remove the old version entry
  await prisma.documentVersion.delete({ where: { id: verId } });

  return NextResponse.json({ ok: true });
}
