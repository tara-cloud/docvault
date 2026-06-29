import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docPath } from "@/lib/files";
import fs from "fs";

type Params = { params: Promise<{ id: string; vid: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, vid } = await params;
  const ver = await prisma.documentVersion.findUnique({ where: { id: Number(vid) } });
  if (!ver || ver.documentId !== Number(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = docPath(ver.uuid, ver.fileExt);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File missing" }, { status: 404 });

  const stream = fs.createReadStream(filePath);
  const webStream = new ReadableStream({
    start(c) {
      stream.on("data", (d) => c.enqueue(d));
      stream.on("end",  () => c.close());
      stream.on("error",(e) => c.error(e));
    },
  });
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": ver.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(ver.originalName)}"`,
    },
  });
}
