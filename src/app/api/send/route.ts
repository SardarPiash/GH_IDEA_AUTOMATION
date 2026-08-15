import { NextRequest, NextResponse } from "next/server";
import { sendIdeaEmail } from "@/lib/gmail";
import { getSubmission, markSplitIdeaSent } from "@/lib/sheets";
import { parseSplitResult } from "@/lib/split";
import { buildIdeaDocx } from "@/lib/docBuilder";

// POST /api/send -> { rowNumber, ideaIndex, to, subject, body }
export async function POST(req: NextRequest) {
  try {
    const { rowNumber, ideaIndex, to, subject, body } = await req.json();
    if (
      rowNumber == null ||
      ideaIndex == null ||
      !to ||
      !subject ||
      !body
    ) {
      return NextResponse.json(
        { error: "rowNumber, ideaIndex, to, subject, and body are required" },
        { status: 400 }
      );
    }

    const row = await getSubmission(rowNumber);
    if (!row) {
      return NextResponse.json({ error: `Row ${rowNumber} not found` }, { status: 404 });
    }

    const parsed = parseSplitResult(row.splitResultJson);
    const idea = parsed?.ideas[ideaIndex];
    if (!idea) {
      return NextResponse.json({ error: "Split idea not found" }, { status: 400 });
    }

    const title = idea.title || "idea";
    const docx = await buildIdeaDocx(title, idea.summary ?? "", row.rawIdeaText);

    await sendIdeaEmail(to, subject, body, {
      filename: `${title}.docx`,
      content: docx,
    });
    const result = await markSplitIdeaSent(rowNumber, ideaIndex, to);

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
