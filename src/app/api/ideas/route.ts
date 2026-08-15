import { NextResponse } from "next/server";
import {
  getSubmission,
  getSubmissionsByStatus,
  saveSplitEdits,
  saveSplitResult,
  type ListStatus,
} from "@/lib/sheets";
import type { StoredIdea } from "@/lib/split";
import { splitIdeas } from "@/lib/classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// POST /api/ideas { rowNumber } -> streams status, then Codex/Gemini result
export async function POST(req: Request) {
  const { rowNumber } = await req.json();
  if (!rowNumber) {
    return NextResponse.json({ error: "rowNumber is required" }, { status: 400 });
  }
  const row = await getSubmission(rowNumber);
  if (!row) {
    return NextResponse.json({ error: `Row ${rowNumber} not found` }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        send({ type: "status", stage: "start", message: "Starting…" });
        const result = await splitIdeas(row, (progress) => {
          send({ type: "status", ...progress });
        });
        await saveSplitResult(rowNumber, JSON.stringify(result));
        send({
          type: "done",
          source: result.source,
          ideaCount: result.ideaCount,
          ideas: result.ideas,
          message: `Finished (${result.source}) — ${result.ideaCount} idea${result.ideaCount === 1 ? "" : "s"} saved.`,
        });
      } catch (err: any) {
        send({ type: "error", message: err.message || "Split failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
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
