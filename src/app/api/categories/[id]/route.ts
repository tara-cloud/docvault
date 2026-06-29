import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const cat = await prisma.category.findUnique({
    where: { id: Number(id) },
    include: { _count: { select: { documents: true } } },
  });
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (cat.isDefault) return NextResponse.json({ error: "Cannot delete default category" }, { status: 403 });
  if (cat._count.documents > 0) return NextResponse.json({ error: "Category has documents" }, { status: 409 });
  await prisma.category.delete({ where: { id: cat.id } });
  return NextResponse.json({ ok: true });
}
