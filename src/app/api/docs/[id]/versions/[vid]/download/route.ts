import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docPath } from "@/lib/files";
import fs from "fs";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, vid } = await params;
  try {
    // Use raw SQL to avoid Prisma schema mismatch on missing columns
    type RawVer = { id: number; document_id: number; uuid: string; file_ext: string; file_size: number; mime_type: string; original_name: string };
    const rows = await prisma.$queryRaw<RawVer[]>`
      SELECT id, document_id, uuid, file_ext, file_size, mime_type, original_name
      FROM document_versions
      WHERE id = ${Number(vid)} AND document_id = ${Number(id)}
      LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ver = rows[0];

    const filePath = docPath(ver.uuid, ver.file_ext);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    const stream = fs.createReadStream(filePath);
    const webStream = new ReadableStream({
      start(c) {
        stream.on("data", (d) => c.enqueue(d));
        stream.on("end",  () => c.close());
        stream.on("error", (e) => c.error(e));
      },
    });
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": ver.mime_type,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(ver.original_name)}"`,
        "Content-Length": String(ver.file_size),
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
