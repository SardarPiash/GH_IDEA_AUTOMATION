import { sendIdeaEmail } from "@/lib/gmail";
import {
  getAllSubmissions,
  markAckEmailSent,
  needsAckEmail,
  type SubmissionRow,
} from "@/lib/sheets";
import {
  submissionAckEmailContent,
  submissionAckEmailSubject,
} from "@/lib/emailTemplate";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function ideaTitleFromRow(row: SubmissionRow): string {
  const firstLine = row.rawIdeaText.trim().split(/\r?\n/).find(Boolean) ?? "";
  const title = firstLine.trim();
  if (!title) return "your idea";
  if (title.length <= 80) return title;
  return `${title.slice(0, 77)}…`;
}

function countByEmail(rows: SubmissionRow[], email: string): number {
  const needle = normalizeEmail(email);
  return rows.filter(
    (row) => normalizeEmail(row.email) === needle && Boolean(row.rawIdeaText.trim())
  ).length;
}

export async function sendPendingAcknowledgmentEmails(): Promise<number> {
  const allRows = await getAllSubmissions();
  const pending = allRows.filter(needsAckEmail);
  let sent = 0;

  for (const row of pending) {
    if (!isValidEmail(row.email)) continue;

    const ideaTitle = ideaTitleFromRow(row);
    const totalIdeaCount = countByEmail(allRows, row.email);
    const { text, html } = submissionAckEmailContent({
      name: row.name,
      ideaTitle,
      totalIdeaCount,
    });

    await sendIdeaEmail(
      row.email.trim(),
      submissionAckEmailSubject(ideaTitle),
      text,
      undefined,
      html
    );
    await markAckEmailSent(row.rowNumber);
    sent += 1;
  }

  return sent;
}
