import { NextRequest, NextResponse } from "next/server";
import { sendIdeaEmail } from "@/lib/gmail";
import { getSubmission, markSplitIdeaSent } from "@/lib/sheets";
import { parseSplitResult } from "@/lib/split";
import { buildIdeaPdf } from "@/lib/pdfBuilder";
import { ideaEmailContent, ideaEmailSubject } from "@/lib/emailTemplate";

// POST /api/send -> { rowNumber, ideaIndex, to }
export async function POST(req: NextRequest) {
  try {
    const { rowNumber, ideaIndex, to } = await req.json();
    if (rowNumber == null || ideaIndex == null || !to) {
      return NextResponse.json(
        { error: "rowNumber, ideaIndex, and to are required" },
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
    const meta = `${row.name || "Unknown submitter"} · PIN ${row.pin || "—"} · ${row.timestamp || "No date"}`;
    const pdf = await buildIdeaPdf(title, idea.summary ?? "", meta);
    const { text, html } = ideaEmailContent(row, title);

    await sendIdeaEmail(
      to,
      ideaEmailSubject(title),
      text,
      {
        filename: `${title}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
      html
    );
    const result = await markSplitIdeaSent(rowNumber, ideaIndex, to);

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
