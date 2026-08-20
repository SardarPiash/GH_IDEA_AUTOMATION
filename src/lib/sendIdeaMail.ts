import { sendIdeaEmail } from "@/lib/gmail";
import { buildIdeaPdf } from "@/lib/pdfBuilder";
import { ideaEmailContent, ideaEmailSubject } from "@/lib/emailTemplate";
import { parseEmails } from "@/lib/emails";
import type { SubmissionRow } from "@/lib/sheets";
import type { StoredIdea } from "@/lib/split";

export async function sendStoredIdeaEmail(
  row: SubmissionRow,
  idea: StoredIdea,
  to: string[],
  options?: { cc?: string[]; responsibleEmails?: string[] }
) {
  const title = idea.title?.trim() || "idea";
  const responsible = options?.responsibleEmails?.length
    ? options.responsibleEmails
    : parseEmails(idea.teamEmail);
  const meta = `${row.name || "Unknown submitter"} · PIN ${row.pin || "—"} · ${row.timestamp || "No date"}`;
  const pdf = await buildIdeaPdf(title, idea.summary ?? "", meta);
  const { text, html } = ideaEmailContent(
    row,
    title,
    responsible.length ? responsible : to
  );
  await sendIdeaEmail(
    to,
    ideaEmailSubject(title),
    text,
    {
      filename: `${title}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    },
    html,
    options?.cc
  );
}
