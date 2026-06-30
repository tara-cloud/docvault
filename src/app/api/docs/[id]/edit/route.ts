import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMimeType, UPLOAD_DIR, docPath } from "@/lib/files";
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
      const ext  = path.extname(newFile.name).toLowerCase() || ".bin";
      const mime = getMimeType(ext);
      // No file type restriction
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
      // Stream to disk instead of buffering in RAM
      const fileStream = newFile.stream();
      const writeStream = fs.createWriteStream(newFileDest);
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
      fileSize = fs.statSync(newFileDest).size;
    }

    // Always archive the previous state as a version
    // Use raw SQL with fallback: try with new columns, fall back without them
    const replacedAt = new Date().toISOString();
    try {
      await prisma.$executeRaw`
        INSERT INTO document_versions
          (document_id, version_num, uuid, original_name, file_ext, file_size, mime_type, version_note, change_type, snapshot, replaced_at)
        VALUES
          (${doc.id}, ${doc.versionNum}, ${doc.uuid}, ${doc.originalName}, ${doc.fileExt}, ${doc.fileSize}, ${doc.mimeType}, ${f("version_note") || null}, ${changeType}, ${snapshot}, ${replacedAt})
      `;
    } catch {
      // Fallback: insert without new columns (migration not yet run)
      await prisma.$executeRaw`
        INSERT INTO document_versions
          (document_id, version_num, uuid, original_name, file_ext, file_size, mime_type, version_note, replaced_at)
        VALUES
          (${doc.id}, ${doc.versionNum}, ${doc.uuid}, ${doc.originalName}, ${doc.fileExt}, ${doc.fileSize}, ${doc.mimeType}, ${f("version_note") || null}, ${replacedAt})
      `;
    }

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
