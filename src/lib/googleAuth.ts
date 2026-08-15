import { createPrivateKey } from "crypto";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export function getGoogleAuth() {
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
    scopes: SCOPES,
  });
}
