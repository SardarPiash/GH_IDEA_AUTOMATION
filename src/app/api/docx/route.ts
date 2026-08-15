import { NextResponse } from "next/server";
import { getSubmission } from "@/lib/sheets";
import { parseSplitResult } from "@/lib/split";
import { buildIdeaDocx } from "@/lib/docBuilder";

function safeFilename(title: string) {
  const base = (title || "idea").replace(/[/\\?%*:|"<>]/g, "-").trim() || "idea";
  return `${base}.docx`;
}

// GET /api/docx?rowNumber=2&ideaIndex=0
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rowNumber = Number(searchParams.get("rowNumber"));
    const ideaIndexRaw = searchParams.get("ideaIndex");
    const ideaIndex = Number(ideaIndexRaw);
    if (!rowNumber || ideaIndexRaw == null || Number.isNaN(ideaIndex)) {
      return NextResponse.json(
        { error: "rowNumber and ideaIndex are required" },
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
    const filename = safeFilename(title);

    return new NextResponse(new Uint8Array(docx), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
