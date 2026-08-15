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
