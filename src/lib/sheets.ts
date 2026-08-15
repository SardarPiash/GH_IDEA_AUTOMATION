import { createPrivateKey } from "crypto";
import { google } from "googleapis";

// Column layout of the sheet copy:
// A:K is a live IMPORTRANGE pull from the original form ("Form Responses 1"),
// so it must not be written to directly:
// A Timestamp | B Email | C Name | D PIN | E WhatsApp | F Idea details (raw)
// G Biggest benefit | H Impact size | I Example/reference | J Attachment link | K Anything else
// N Status (added by us, off to the side of the import range: "", "split", "sent")
// O SplitResultJSON (added by us, cached AI output)

const SHEET_RANGE = "Form Responses 1!A2:O"; // adjust the tab name if yours differs

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY_BASE64
    ? Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, "base64").toString("utf-8")
    : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in .env.local"
    );
  }
  const normalizedKey = createPrivateKey(key).export({ type: "pkcs8", format: "pem" }).toString();
  return new google.auth.JWT({
    email,
    key: normalizedKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
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
};

export async function getPendingSubmissions(): Promise<SubmissionRow[]> {
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
    }));
  } catch (err) {
    console.error("Sheets error:", err);
    throw err;
  }
}

export async function saveSplitResult(rowNumber: number, splitResultJson: string) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Form Responses 1!N${rowNumber}:O${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [["split", splitResultJson]] },
  });
}

export async function markIdeaSent(rowNumber: number) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Form Responses 1!N${rowNumber}:N${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [["sent"]] },
  });
}
