import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALLOWED_MIME, UPLOAD_DIR, docPath } from "@/lib/files";
import { normalizeTags, humanSize, parseTags, computeExpiry } from "@/lib/utils";
import { randomUUID } from "crypto";
import formidable from "formidable";
import fs from "fs";
import path from "path";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id: Number(id) } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = formidable({ maxFileSize: 50 * 1024 * 1024, keepExtensions: true });
  const nodeReq = req as unknown as Parameters<typeof form.parse>[0];
  const [fields, files] = await form.parse(nodeReq);

  const f = (k: string) => (Array.isArray(fields[k]) ? fields[k][0] : fields[k]) ?? "";

  let uuid    = doc.uuid;
  let fileExt = doc.fileExt;
  let fileSize= doc.fileSize;
  let mimeType= doc.mimeType;
  let originalName = doc.originalName;
  let versionNum   = doc.versionNum;

  const newFile = Array.isArray(files.new_file) ? files.new_file[0] : files.new_file;
  if (newFile) {
    const ext  = path.extname(newFile.originalFilename ?? "").toLowerCase();
    const mime = ALLOWED_MIME[ext];
    if (!mime) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });

    // Archive current version
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
        replacedAt:   new Date().toISOString(),
      },
    });

    uuid    = randomUUID();
    fileExt = ext;
    mimeType= mime;
    originalName = newFile.originalFilename ?? "unknown";
    versionNum++;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.renameSync(newFile.filepath, docPath(uuid, ext));
    fileSize = fs.statSync(docPath(uuid, ext)).size;
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      uuid, fileExt, fileSize, mimeType, originalName, versionNum,
      displayName:  f("display_name") || doc.displayName,
      description:  f("description") || null,
      categoryId:   f("category_id") ? Number(f("category_id")) : doc.categoryId,
      folderId:     f("folder_id") ? Number(f("folder_id")) : null,
      tags:         normalizeTags(f("tags")),
      expiryDate:   f("expiry_date") || null,
      uploadedAt:   newFile ? new Date().toISOString() : doc.uploadedAt,
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
}
