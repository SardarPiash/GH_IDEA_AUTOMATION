import type { SubmissionRow } from "@/lib/sheets";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function display(value: string) {
  const trimmed = value.trim();
  return trimmed || "—";
}

export function ideaEmailSubject(title: string) {
  return `Idea for your review: ${title.trim() || "Untitled idea"}`;
}

export function ideaEmailContent(
  row: SubmissionRow,
  title: string
): { text: string; html: string } {
  const idea = display(title);
  const submittedBy = display(row.name);
  const pin = display(row.pin);
  const benefit = display(row.biggestBenefit);
  const impact = display(row.impactSize);

  const text = `Dear Team,

We have received an idea through our idea submission initiative that is relevant to your team’s area of responsibility. We are therefore handing over the idea to your team for further review and necessary action.

Idea: ${idea}
Submitted By: ${submittedBy}
PIN: ${pin}
Expected Benefit: ${benefit}
Expected Impact: ${impact}

The detailed idea document is attached to this email for your reference.

Please review the idea and proceed with the necessary steps from your end.

Regards,
Growth Hack Team
`;

  const html = `<p>Dear Team,</p>
<p>We have received an idea through our idea submission initiative that is relevant to your team’s area of responsibility. We are therefore handing over the idea to your team for further review and necessary action.</p>
<p>
  <strong>Idea:</strong> ${escapeHtml(idea)}<br>
  <strong>Submitted By:</strong> ${escapeHtml(submittedBy)}<br>
  <strong>PIN:</strong> ${escapeHtml(pin)}<br>
  <strong>Expected Benefit:</strong> ${escapeHtml(benefit)}<br>
  <strong>Expected Impact:</strong> ${escapeHtml(impact)}
</p>
<p>The detailed idea document is attached to this email for your reference.</p>
<p>Please review the idea and proceed with the necessary steps from your end.</p>
<p>Regards,<br><strong>Growth Hack Team</strong></p>`;

  return { text, html };
}

function orgName() {
  return process.env.ORG_NAME?.trim() || "রকমারি গ্রোথ আইডিয়া";
}

function senderName() {
  return process.env.SENDER_NAME?.trim() || "GH team";
}

function senderOrg() {
  return process.env.SENDER_ORG?.trim() || "rokomari.com";
}

export function submissionAckEmailSubject(ideaTitle: string) {
  return `Thank you for submitting your idea — ${ideaTitle}`;
}

export function submissionAckEmailContent({
  name,
  ideaTitle,
  totalIdeaCount,
}: {
  name: string;
  ideaTitle: string;
  totalIdeaCount: number;
}) {
  const submitter = name.trim() || "there";
  const org = orgName();
  const sender = senderName();
  const fromOrg = senderOrg();
  const countLabel =
    totalIdeaCount === 1 ? "1st" : totalIdeaCount === 2 ? "2nd" : totalIdeaCount === 3 ? "3rd" : `${totalIdeaCount}th`;

  const text = `Hi ${submitter},

Thank you for submitting your idea — "${ideaTitle}" — we really appreciate you taking the time to share it.

This is your ${countLabel} idea submitted so far. Every idea you share helps us build a better ${org}, and we're grateful for your continued contribution.

Here's what happens next:
1. Our team will carefully review your idea.
2. Once reviewed, it will be forwarded to the relevant team for further action.
3. If we need more details or clarification, someone from our side will reach out to you directly.

We truly encourage you to keep sharing your ideas in the future — great things often start with a simple idea like this one. Don't hesitate to submit more whenever inspiration strikes!

Thank you again for being an active contributor.

Warm regards,
${sender}
${fromOrg}
`;

  const html = `<p>Hi ${escapeHtml(submitter)},</p>
<p>Thank you for submitting your idea — <strong>${escapeHtml(ideaTitle)}</strong> — we really appreciate you taking the time to share it.</p>
<p>This is your <strong>${escapeHtml(countLabel)}</strong> idea submitted so far. Every idea you share helps us build a better <strong>${escapeHtml(org)}</strong>, and we're grateful for your continued contribution.</p>
<p><strong>Here's what happens next:</strong></p>
<ol>
  <li>Our team will carefully review your idea.</li>
  <li>Once reviewed, it will be forwarded to the relevant team for further action.</li>
  <li>If we need more details or clarification, someone from our side will reach out to you directly.</li>
</ol>
<p>We truly encourage you to keep sharing your ideas in the future — great things often start with a simple idea like this one. Don't hesitate to submit more whenever inspiration strikes!</p>
<p>Thank you again for being an active contributor.</p>
<p>Warm regards,<br><strong>${escapeHtml(sender)}</strong><br>${escapeHtml(fromOrg)}</p>`;

  return { text, html };
}
