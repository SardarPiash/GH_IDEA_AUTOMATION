export type IdeaSourceRow = {
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
};

export function formatSourceRow(row: IdeaSourceRow): string {
  return [
    `Submitted By: ${row.name || ""}`,
    `PIN: ${row.pin || ""}`,
    `Email: ${row.email || ""}`,
    `WhatsApp: ${row.whatsapp || ""}`,
    `Submission Date: ${row.timestamp || ""}`,
    `Idea details: ${row.rawIdeaText || ""}`,
    `Primary Benefit: ${row.biggestBenefit || ""}`,
    `Expected Impact: ${row.impactSize || ""}`,
    `Example / Reference: ${row.example || ""}`,
    `Attachment link: ${row.attachmentLink || ""}`,
    `Anything else: ${row.anythingElse || ""}`,
  ].join("\n");
}

export function buildProposalPrompt(row: IdeaSourceRow): string {
  return `You write idea-proposal documents from one form submission row.

Use EVERY non-empty field below. Do not invent names, dates, benefits, impact, URLs, examples, or extra claims that are not in the input. If a field is empty, omit it from the document — do not guess.

LANGUAGE AND SPELLING (critical):
- Write in the same language as the idea details.
- If the idea is in Bangla, write correct standard Bangla (বাংলা বানান). Do not mix broken transliteration.
- Copy the submitter's Bangla words as-is when they are already correct. Clean English grammar only; do not "rewrite" Bangla into phonetic or misspelled forms.
- Keep English product names, brand names, and quotes in English (example: "Buy More, Save More", Flipkart, Add to Cart).
- Never insert spaces, tabs, or extra characters inside a Bangla word. Conjuncts like প্রস্তাবনা, উইজেট, জমাদান must stay as one word.
- Length: medium — not a one-liner, not a long essay.

If the idea details contain truly separate independent ideas, output one document per idea. If numbered points are features of one idea, keep them as one document. Shared row fields (name, PIN, date, benefit, impact, reference) apply to each document.

The markdown shape below is a SAMPLE only. Add, drop, or rename sections to match what the input actually contains.

Sample shape:
# Idea Proposal: <short title from the idea>

## 1. Idea Submission Information

| Field | Information |
| --- | --- |
| **Submitted By** | ... |
| **PIN** | ... |
| **Submission Date** | ... |
| **Idea** | ... |
| **Primary Benefit** | ... |
| **Expected Impact** | ... |
| **Example / Reference** | ... |

---

## 2. Idea Overview
Short restatement of the idea from the input.

## 3. Expected Benefit
Only if a benefit was given.

## 4. Expected Impact
Only if impact was given.

## 5. Supporting Reference
Only if an example/reference/link was given. Use the real URL from the input if present.

Submission row:
"""
${formatSourceRow(row)}
"""

Return JSON only:
{
  "ideaCount": <number>,
  "ideas": [
    {
      "title": "<short title>",
      "summary": "<full markdown proposal document>"
    }
  ]
}`;
}
