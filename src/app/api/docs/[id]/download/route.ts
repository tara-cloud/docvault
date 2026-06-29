import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docPath } from "@/lib/files";
import fs from "fs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id: Number(id) } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = docPath(doc.uuid, doc.fileExt);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const stream = fs.createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end",  () => controller.close());
      stream.on("error", (e) => controller.error(e));
    },
  });

  const filename = encodeURIComponent(doc.originalName);
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.fileSize),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
