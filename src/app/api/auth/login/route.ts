import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { compare } from "bcryptjs";
import { sessionOptions } from "@/lib/auth";
import type { SessionData } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { password } = await req.json() as { password: string };

  // Check DB-stored hash first, fall back to env var
  const stored = await prisma.setting.findUnique({ where: { key: "password_hash" } });
  let valid = false;
  if (stored) {
    valid = await compare(password, stored.value);
  } else {
    valid = password === (process.env.APP_PASSWORD ?? "changeme");
  }

  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.authenticated = true;
  await session.save();
  return res;
}
