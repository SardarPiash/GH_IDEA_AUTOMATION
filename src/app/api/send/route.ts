import { NextRequest, NextResponse } from "next/server";
import { sendIdeaEmail } from "@/lib/gmail";
import { markIdeaSent } from "@/lib/sheets";

// POST /api/send -> { rowNumber, to, subject, body }
export async function POST(req: NextRequest) {
  try {
    const { rowNumber, to, subject, body } = await req.json();
    if (!rowNumber || !to || !subject || !body) {
      return NextResponse.json(
        { error: "rowNumber, to, subject, and body are required" },
        { status: 400 }
      );
    }

    await sendIdeaEmail(to, subject, body);
    await markIdeaSent(rowNumber);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
