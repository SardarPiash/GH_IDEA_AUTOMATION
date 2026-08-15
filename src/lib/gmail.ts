import nodemailer from "nodemailer";

// Sends mail via plain SMTP using a Gmail App Password — no OAuth client,
// no consent screen, no refresh token needed. Requires 2-Step Verification
// to be turned on for the sending Gmail account, and an App Password
// generated at myaccount.google.com/apppasswords.

function getTransporter() {
  const user = process.env.GMAIL_SENDER_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "Missing GMAIL_SENDER_ADDRESS or GMAIL_APP_PASSWORD in .env.local"
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendIdeaEmail(to: string, subject: string, body: string) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.GMAIL_SENDER_ADDRESS,
    to,
    subject,
    text: body,
  });
}
