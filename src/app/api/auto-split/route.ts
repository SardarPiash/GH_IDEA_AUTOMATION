import { NextResponse } from "next/server";
import { readAutoSplitState } from "@/lib/autoSplitStore";
import {
  ensureAutoSplitWorker,
  setAckEmailEnabled,
  setAutoSplitEnabled,
} from "@/lib/autoSplitWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureAutoSplitWorker();
  return NextResponse.json(readAutoSplitState());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    enabled?: unknown;
    ackEmailEnabled?: unknown;
  } | null;

  if (!body || (body.enabled === undefined && body.ackEmailEnabled === undefined)) {
    return NextResponse.json(
      { error: "Provide enabled and/or ackEmailEnabled as booleans" },
      { status: 400 }
    );
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    setAutoSplitEnabled(body.enabled);
  }

  if (body.ackEmailEnabled !== undefined) {
    if (typeof body.ackEmailEnabled !== "boolean") {
      return NextResponse.json({ error: "ackEmailEnabled must be a boolean" }, { status: 400 });
    }
    setAckEmailEnabled(body.ackEmailEnabled);
  }

  return NextResponse.json(readAutoSplitState());
}
