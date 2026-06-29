import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { name } = await req.json() as { name: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const folder = await prisma.folder.update({
    where: { id: Number(id) },
    data:  { name: name.trim() },
  });
  return NextResponse.json(folder);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const count = await prisma.document.count({ where: { folderId: Number(id) } });
  if (count > 0) return NextResponse.json({ error: "Folder not empty" }, { status: 409 });
  await prisma.folder.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
