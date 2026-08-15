import { buildProposalPrompt, type IdeaSourceRow } from "@/lib/proposalPrompt";

export type SplitIdea = {
  title: string;
  summary: string;
};

export type SplitResult = {
  ideaCount: number;
  ideas: SplitIdea[];
};

export async function splitIdeas(row: IdeaSourceRow): Promise<SplitResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildProposalPrompt(row) }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as SplitResult;
  return parsed;
}
