import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const folders = await prisma.folder.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(folders);
}

export async function POST(req: NextRequest) {
  const { name, parentId } = await req.json() as { name: string; parentId?: number | null };
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const folder = await prisma.folder.create({
    data: { name: name.trim(), parentId: parentId ?? null, createdAt: new Date().toISOString() },
  });
  return NextResponse.json(folder, { status: 201 });
}
