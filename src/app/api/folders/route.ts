import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const folders = await prisma.folder.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(folders);
}

export async function POST(req: NextRequest) {
  try {
    const { name, parentId } = await req.json() as { name: string; parentId?: number | null };
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    // Validate parent exists when provided
    if (parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: parentId } });
      if (!parent) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }

    const folder = await prisma.folder.create({
      data: { name: name.trim(), parentId: parentId ?? null, createdAt: new Date().toISOString() },
    });
    return NextResponse.json(folder, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique") || msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "A folder with that name already exists here" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
