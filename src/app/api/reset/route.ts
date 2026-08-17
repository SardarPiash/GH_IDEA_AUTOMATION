import { NextResponse } from "next/server";
import { clearAllProcessing } from "@/lib/sheets";
import { ensureAutoSplitWorker, resetAutoSplitRuntime } from "@/lib/autoSplitWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    ensureAutoSplitWorker();
    const result = await clearAllProcessing();
    resetAutoSplitRuntime();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
