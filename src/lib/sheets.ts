import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/googleAuth";
import { parseSplitResult, type StoredIdea } from "@/lib/split";

export type { StoredIdea, StoredSplitResult } from "@/lib/split";
export { parseSplitResult } from "@/lib/split";

// Column layout of the sheet copy:
// A:K is a live IMPORTRANGE pull from the original form ("Form Responses 1"),
// so it must not be written to directly:
// A Timestamp | B Email | C Name | D PIN | E WhatsApp | F Idea details (raw)
// G Biggest benefit | H Impact size | I Example/reference | J Attachment link | K Anything else
// N Status (added by us: "", "split", "sent")
// O SplitResultJSON (added by us, cached AI output)
// P AckEmailSent (added by us: "", "sent" — thank-you email to submitter)

const SHEET_RANGE = "Form Responses 1!A2:P"; // adjust the tab name if yours differs

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getGoogleAuth() });
}

export type SubmissionRow = {
  rowNumber: number; // 1-indexed sheet row, for writing back
  timestamp: string;
  email: string;
  name: string;
  pin: string;
  whatsapp: string;
  rawIdeaText: string;
  biggestBenefit: string;
  impactSize: string;
  example: string;
  attachmentLink: string;
  anythingElse: string;
  status: string;
  splitResultJson: string;
  ackEmailSent: string;
};

export type ListStatus = "pending" | "split";

function rowStatus(row: SubmissionRow): string {
  return (row.status || "").trim().toLowerCase();
}

export function isPendingRow(row: SubmissionRow): boolean {
  const status = rowStatus(row);
  return status !== "split" && status !== "sent" && Boolean(row.rawIdeaText.trim());
}

export function isSplitRow(row: SubmissionRow): boolean {
  const status = rowStatus(row);
  return (status === "split" || status === "sent") && Boolean(row.splitResultJson);
}

export async function getSubmissions(): Promise<SubmissionRow[]> {
  try {
    const sheets = getSheetsClient();
    const sheetId = process.env.SHEET_ID;
    if (!sheetId) throw new Error("Missing SHEET_ID in .env.local");

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: SHEET_RANGE,
    });

    const rows = res.data.values ?? [];

    return rows.map((row, idx) => ({
      rowNumber: idx + 2, // +2 because range starts at row 2 and is 1-indexed
      timestamp: row[0] ?? "",
      email: row[1] ?? "",
      name: row[2] ?? "",
      pin: row[3] ?? "",
      whatsapp: row[4] ?? "",
      rawIdeaText: row[5] ?? "",
      biggestBenefit: row[6] ?? "",
      impactSize: row[7] ?? "",
      example: row[8] ?? "",
      attachmentLink: row[9] ?? "",
      anythingElse: row[10] ?? "",
      // row[11] and row[12] correspond to columns L and M, deliberately left
      // blank/unused as a buffer next to the IMPORTRANGE output.
      status: row[13] ?? "",
      splitResultJson: row[14] ?? "",
      ackEmailSent: row[15] ?? "",
    }));
  } catch (err) {
    console.error("Sheets error:", err);
    throw err;
  }
}

export function hasSubmissionContent(row: SubmissionRow): boolean {
  return Boolean(row.rawIdeaText.trim() || row.name.trim() || row.email.trim());
}

export async function getAllSubmissions(): Promise<SubmissionRow[]> {
  const rows = await getSubmissions();
  return rows.filter(hasSubmissionContent);
}

export async function getSubmissionsByStatus(status: ListStatus): Promise<SubmissionRow[]> {
  const rows = await getSubmissions();
  return rows.filter(status === "pending" ? isPendingRow : isSplitRow);
}

export async function getSubmission(rowNumber: number): Promise<SubmissionRow | null> {
  const rows = await getSubmissions();
  return rows.find((row) => row.rowNumber === rowNumber) ?? null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function needsAckEmail(row: SubmissionRow): boolean {
  const ack = (row.ackEmailSent || "").trim().toLowerCase();
  return ack !== "sent" && Boolean(row.rawIdeaText.trim()) && Boolean(row.email.trim());
}

export async function getSubmissionsNeedingAckEmail(): Promise<SubmissionRow[]> {
  const rows = await getAllSubmissions();
  return rows.filter(needsAckEmail);
}

export async function countSubmissionsByEmail(email: string): Promise<number> {
  const needle = normalizeEmail(email);
  if (!needle) return 0;
  const rows = await getAllSubmissions();
  return rows.filter(
    (row) => normalizeEmail(row.email) === needle && Boolean(row.rawIdeaText.trim())
  ).length;
}

export async function markAckEmailSent(rowNumber: number) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Form Responses 1!P${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [["sent"]] },
  });
}

async function writeSplitColumns(rowNumber: number, status: string, splitResultJson: string) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Form Responses 1!N${rowNumber}:O${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status, splitResultJson]] },
  });
}

export async function saveSplitResult(rowNumber: number, splitResultJson: string) {
  await writeSplitColumns(rowNumber, "split", splitResultJson);
}

export async function saveSplitEdits(rowNumber: number, ideas: StoredIdea[]) {
  const rows = await getSubmissions();
  const row = rows.find((r) => r.rowNumber === rowNumber);
  if (!row) throw new Error(`Row ${rowNumber} not found`);
  const status = rowStatus(row) === "sent" ? "sent" : "split";
  await writeSplitColumns(
    rowNumber,
    status,
    JSON.stringify({ ideaCount: ideas.length, ideas })
  );
}

export async function clearAllProcessing(): Promise<{ cleared: number }> {
  const rows = await getSubmissions();
  const lastRow = rows.reduce((max, row) => Math.max(max, row.rowNumber), 1);
  const cleared = rows.filter(
    (row) => row.status.trim() || row.splitResultJson.trim() || row.ackEmailSent.trim()
  ).length;
  if (lastRow < 2 || cleared === 0) return { cleared: 0 };

  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const emptyRows = Array.from({ length: lastRow - 1 }, () => ["", "", ""]);
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Form Responses 1!N2:P${lastRow}`,
    valueInputOption: "RAW",
    requestBody: { values: emptyRows },
  });
  return { cleared };
}

export async function markSplitIdeaSent(
  rowNumber: number,
  ideaIndex: number,
  teamEmail: string
): Promise<{ allSent: boolean; ideas: StoredIdea[] }> {
  const rows = await getSubmissions();
  const row = rows.find((r) => r.rowNumber === rowNumber);
  if (!row) throw new Error(`Row ${rowNumber} not found`);

  const parsed = parseSplitResult(row.splitResultJson);
  if (!parsed?.ideas[ideaIndex]) throw new Error("Split idea not found");

  const ideas = parsed.ideas.map((idea, i) =>
    i === ideaIndex ? { ...idea, teamEmail, sent: true } : idea
  );
  const allSent = ideas.every((idea) => idea.sent);
  await writeSplitColumns(
    rowNumber,
    allSent ? "sent" : "split",
    JSON.stringify({ ideaCount: ideas.length, ideas })
  );
  return { allSent, ideas };
}
