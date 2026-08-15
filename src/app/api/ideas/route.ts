import { NextResponse } from "next/server";
import {
  getSubmissionsByStatus,
  saveSplitEdits,
  saveSplitResult,
  type ListStatus,
} from "@/lib/sheets";
import type { StoredIdea } from "@/lib/split";
import { splitIdeas } from "@/lib/gemini";

// GET /api/ideas?status=pending|split
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") || "pending") as ListStatus;
    if (status !== "pending" && status !== "split") {
      return NextResponse.json(
        { error: "status must be pending or split" },
        { status: 400 }
      );
    }
    const rows = await getSubmissionsByStatus(status);
    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/ideas { rowNumber, rawText } -> Gemini split, cache in the sheet
export async function POST(req: Request) {
  try {
    const { rowNumber, rawText } = await req.json();
    if (!rowNumber || !rawText) {
      return NextResponse.json(
        { error: "rowNumber and rawText are required" },
        { status: 400 }
      );
    }
    const result = await splitIdeas(rawText);
    await saveSplitResult(rowNumber, JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/ideas { rowNumber, ideas } -> persist title/summary/email edits to column O
export async function PATCH(req: Request) {
  try {
    const { rowNumber, ideas } = (await req.json()) as {
      rowNumber?: number;
      ideas?: StoredIdea[];
    };
    if (!rowNumber || !Array.isArray(ideas)) {
      return NextResponse.json(
        { error: "rowNumber and ideas are required" },
        { status: 400 }
      );
    }
    await saveSplitEdits(rowNumber, ideas);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
