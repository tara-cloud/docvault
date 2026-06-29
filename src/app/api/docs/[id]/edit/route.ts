import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALLOWED_MIME, UPLOAD_DIR, docPath } from "@/lib/files";
import { normalizeTags, humanSize, parseTags, computeExpiry } from "@/lib/utils";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id: Number(id) },
    include: { category: true, folder: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const formData = await req.formData();
    const f = (k: string) => {
      const v = formData.get(k);
      return typeof v === "string" ? v : "";
    };

    let uuid         = doc.uuid;
    let fileExt      = doc.fileExt;
    let fileSize     = doc.fileSize;
    let mimeType     = doc.mimeType;
    let originalName = doc.originalName;
    let versionNum   = doc.versionNum;
    let newFileDest: string | null = null;
    let changeType   = "metadata";

    // Snapshot the current state before any changes
    const snapshot = JSON.stringify({
      displayName:  doc.displayName,
      description:  doc.description,
      categoryId:   doc.categoryId,
      categoryName: doc.category.name,
      folderId:     doc.folderId,
      folderName:   doc.folder?.name ?? null,
      tags:         parseTags(doc.tags),
      expiryDate:   doc.expiryDate,
    });

    const newFileEntry = formData.get("new_file");
    if (newFileEntry && typeof newFileEntry !== "string") {
      const newFile = newFileEntry as File;
      const ext  = path.extname(newFile.name).toLowerCase();
      const mime = ALLOWED_MIME[ext];
      if (!mime) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
      if (newFile.size > 100 * 1024 * 1024) {
        return NextResponse.json({ error: "File exceeds 100 MB limit" }, { status: 413 });
      }
      changeType   = "file";
      uuid         = randomUUID();
      fileExt      = ext;
      mimeType     = mime;
      originalName = newFile.name;
      versionNum++;
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      newFileDest = docPath(uuid, ext);
      const buffer = Buffer.from(await newFile.arrayBuffer());
      fs.writeFileSync(newFileDest, buffer);
      fileSize = buffer.length;
    }

    // Always archive the previous state as a version
    await prisma.documentVersion.create({
      data: {
        documentId:   doc.id,
        versionNum:   doc.versionNum,
        uuid:         doc.uuid,
        originalName: doc.originalName,
        fileExt:      doc.fileExt,
        fileSize:     doc.fileSize,
        mimeType:     doc.mimeType,
        versionNote:  f("version_note") || null,
        changeType,
        snapshot,
        replacedAt:   new Date().toISOString(),
      },
    });

    // When only metadata changed, keep versionNum the same (file unchanged)
    // When file changed, versionNum was already incremented above

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: {
        uuid, fileExt, fileSize, mimeType, originalName,
        versionNum: changeType === "file" ? versionNum : doc.versionNum,
        displayName:  f("display_name") || doc.displayName,
        description:  f("description") || null,
        categoryId:   f("category_id") ? Number(f("category_id")) : doc.categoryId,
        folderId:     f("folder_id") ? Number(f("folder_id")) : null,
        tags:         normalizeTags(f("tags")),
        expiryDate:   f("expiry_date") || null,
        uploadedAt:   newFileDest ? new Date().toISOString() : doc.uploadedAt,
      },
      include: { category: true, folder: true },
    });

    const expiry = computeExpiry(updated.expiryDate);
    return NextResponse.json({
      ...updated,
      tagsList: parseTags(updated.tags),
      fileSizeHuman: humanSize(updated.fileSize),
      expiryStatus: expiry.status,
      daysUntilExpiry: expiry.daysUntil,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
