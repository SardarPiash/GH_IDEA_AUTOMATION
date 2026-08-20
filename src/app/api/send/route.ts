import { NextRequest, NextResponse } from "next/server";
import { getSubmission, markSplitIdeaSent } from "@/lib/sheets";
import { parseSplitResult } from "@/lib/split";
import { sendStoredIdeaEmail } from "@/lib/sendIdeaMail";
import { formatEmails, invalidEmails, isValidEmail, parseEmails } from "@/lib/emails";

// POST /api/send -> { rowNumber, ideaIndex, to }
export async function POST(req: NextRequest) {
  try {
    const { rowNumber, ideaIndex, to, ccSubmitter } = await req.json();
    if (rowNumber == null || ideaIndex == null || !to) {
      return NextResponse.json(
        { error: "rowNumber, ideaIndex, and to are required" },
        { status: 400 }
      );
    }

    const teamEmails = parseEmails(to);
    const bad = invalidEmails(teamEmails);
    if (!teamEmails.length) {
      return NextResponse.json({ error: "Enter at least one team email" }, { status: 400 });
    }
    if (bad.length) {
      return NextResponse.json(
        { error: `Not a valid email: ${bad[0]}` },
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

    const submitter = parseEmails(row.email)[0];
    const includeSubmitter = Boolean(ccSubmitter ?? idea.ccSubmitter);
    const cc =
      includeSubmitter && submitter && isValidEmail(submitter) && !teamEmails.includes(submitter)
        ? [submitter]
        : [];
    const storedTo = formatEmails(teamEmails);

    await sendStoredIdeaEmail(row, idea, teamEmails, {
      cc,
      responsibleEmails: teamEmails,
    });
    const result = await markSplitIdeaSent(rowNumber, ideaIndex, storedTo);

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
