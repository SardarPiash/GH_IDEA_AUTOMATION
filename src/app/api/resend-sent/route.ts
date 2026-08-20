import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, parseEmails } from "@/lib/emails";
import { sendStoredIdeaEmail } from "@/lib/sendIdeaMail";
import { listSentIdeas } from "@/lib/sentIdeas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export async function GET() {
  try {
    const items = await listSentIdeas();
    return NextResponse.json({
      count: items.length,
      items: items.map(({ row, idea, ideaIndex }) => ({
        rowNumber: row.rowNumber,
        ideaIndex,
        title: idea.title || "Untitled idea",
        name: row.name || "Unknown submitter",
        teamEmail: idea.teamEmail || "",
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

// POST /api/resend-sent { to } -> streams one already-sent idea email at a time
export async function POST(req: NextRequest) {
  const { to } = await req.json().catch(() => ({ to: "" }));
  const emails = parseEmails(to);
  if (emails.length !== 1 || !isValidEmail(emails[0])) {
    return NextResponse.json(
      { error: "Enter one valid email address" },
      { status: 400 }
    );
  }
  const target = emails[0];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const items = await listSentIdeas();
        send({ type: "start", total: items.length, to: target });
        if (!items.length) {
          send({ type: "done", sent: 0, failed: 0, total: 0 });
          return;
        }

        let sent = 0;
        let failed = 0;
        for (let i = 0; i < items.length; i += 1) {
          const { row, idea } = items[i];
          const title = idea.title?.trim() || "Untitled idea";
          try {
            await sendStoredIdeaEmail(row, idea, [target]);
            sent += 1;
            send({ type: "progress", index: i + 1, total: items.length, title, ok: true });
          } catch (err) {
            failed += 1;
            send({
              type: "progress",
              index: i + 1,
              total: items.length,
              title,
              ok: false,
              error: errorMessage(err),
            });
          }
        }
        send({ type: "done", sent, failed, total: items.length });
      } catch (err) {
        send({ type: "error", message: errorMessage(err) });
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
