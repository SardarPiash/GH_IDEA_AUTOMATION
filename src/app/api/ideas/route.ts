import { NextResponse } from "next/server";
import { getPendingSubmissions, saveSplitResult } from "@/lib/sheets";
import { splitIdeas } from "@/lib/gemini";

// GET /api/ideas -> list all submission rows (with any cached split result)
export async function GET() {
  try {
    const rows = await getPendingSubmissions();
    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/ideas { rowNumber, rawText } -> runs Gemini split, caches it back
// to the sheet, and returns the parsed ideas.
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
