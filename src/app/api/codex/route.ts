import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runCodex } from "@/lib/codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = process.env.CODEX_GATEWAY_KEY;
  if (!expected) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET() {
  return NextResponse.json({ status: "ok", backend: "codex-cli", authenticated: Boolean(process.env.CODEX_GATEWAY_KEY) });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as { input?: unknown };
    if (typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "input must be a non-empty string" }, { status: 400 });
    }
    return NextResponse.json({ output: await runCodex(body.input) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Codex request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
