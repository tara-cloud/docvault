import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { folderId } = await req.json() as { folderId: number | null };

  const doc = await prisma.document.findUnique({ where: { id: Number(id) } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.document.update({
    where: { id: doc.id },
    data:  { folderId: folderId ?? null },
  });
  return NextResponse.json({ ok: true });
}
