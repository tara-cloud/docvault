import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const cats = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: true } } },
  });
  return NextResponse.json(cats.map(c => ({ ...c, docCount: c._count.documents })));
}

export async function POST(req: NextRequest) {
  const { name, icon } = await req.json() as { name: string; icon?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  const cat  = await prisma.category.create({
    data: { name: name.trim(), slug, icon: icon?.trim() || "folder", isDefault: false },
  });
  return NextResponse.json(cat, { status: 201 });
}
