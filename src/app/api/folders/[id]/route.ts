import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const folderId = Number(id);
  const body = await req.json() as { name?: string; parentId?: number | null };

  // Guard: prevent moving a folder into itself or its own descendant
  if ("parentId" in body && body.parentId !== undefined) {
    if (body.parentId === folderId) {
      return NextResponse.json({ error: "Cannot move a folder into itself" }, { status: 400 });
    }
    // Check parentId is not a descendant of this folder
    if (body.parentId !== null) {
      const isDescendant = await checkIsDescendant(folderId, body.parentId);
      if (isDescendant) {
        return NextResponse.json({ error: "Cannot move a folder into its own subfolder" }, { status: 400 });
      }
    }
  }

  const data: { name?: string; parentId?: number | null } = {};
  if (body.name?.trim()) data.name = body.name.trim();
  if ("parentId" in body) data.parentId = body.parentId ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const folder = await prisma.folder.update({ where: { id: folderId }, data });
  return NextResponse.json(folder);
}

async function checkIsDescendant(ancestorId: number, targetId: number): Promise<boolean> {
  // Walk up from targetId to see if we hit ancestorId
  let cur: number | null = targetId;
  const visited = new Set<number>();
  while (cur !== null) {
    if (cur === ancestorId) return true;
    if (visited.has(cur)) break; // cycle guard
    visited.add(cur);
    const f = await prisma.folder.findUnique({ where: { id: cur }, select: { parentId: true } }) as { parentId: number | null } | null;
    cur = f?.parentId ?? null;
  }
  return false;
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const folderId = Number(id);

  // Check for docs directly in this folder
  const docCount = await prisma.document.count({ where: { folderId } });
  if (docCount > 0) return NextResponse.json({ error: "Folder not empty" }, { status: 409 });

  // Check for subfolders
  const subCount = await prisma.folder.count({ where: { parentId: folderId } });
  if (subCount > 0) return NextResponse.json({ error: "Folder has subfolders — move or delete them first" }, { status: 409 });

  await prisma.folder.delete({ where: { id: folderId } });
  return NextResponse.json({ ok: true });
}
