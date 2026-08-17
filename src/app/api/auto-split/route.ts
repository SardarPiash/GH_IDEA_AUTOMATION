import { NextResponse } from "next/server";
import { readAutoSplitState } from "@/lib/autoSplitStore";
import { ensureAutoSplitWorker, setAutoSplitEnabled } from "@/lib/autoSplitWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureAutoSplitWorker();
  return NextResponse.json(readAutoSplitState());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }
  setAutoSplitEnabled(body.enabled);
  return NextResponse.json(readAutoSplitState());
}
