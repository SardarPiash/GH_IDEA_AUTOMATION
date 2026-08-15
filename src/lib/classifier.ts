import { runCodex } from "@/lib/codex";
import { splitIdeas as splitIdeasWithGemini } from "@/lib/gemini";

export type SplitIdea = { title: string; summary: string };
export type SplitResult = { ideaCount: number; ideas: SplitIdea[] };

const splitResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ideaCount", "ideas"],
  properties: {
    ideaCount: { type: "integer", minimum: 0 },
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary"],
        properties: { title: { type: "string" }, summary: { type: "string" } },
      },
    },
  },
};

function buildPrompt(rawText: string): string {
  return `তুমি একটি idea-review সহকারী। নিচের টেক্সটে একজন কর্মী একটি ফর্মে তার আইডিয়া লিখেছে। এই টেক্সটে এক বা একাধিক আলাদা আইডিয়া থাকতে পারে।

গুরুত্বপূর্ণ নিয়ম:
- যদি টেক্সটে নম্বরযুক্ত পয়েন্ট থাকে কিন্তু সেগুলো আসলে একটি মূল আইডিয়ার feature/sub-point হয় (একই লক্ষ্য অর্জনের জন্য একসাথে কাজ করে), তাহলে সেটি ১টি আইডিয়া হিসেবে গণনা করবে।
- যদি নম্বরযুক্ত পয়েন্টগুলো সত্যিকারের আলাদা, স্বাধীন আইডিয়া হয় (একটি ছাড়া আরেকটি বোঝা যায়, ভিন্ন সমস্যার সমাধান), তাহলে প্রতিটিকে আলাদা আইডিয়া হিসেবে গণনা করবে।

টেক্সট:
"""
${rawText}
"""

শুধু schema অনুযায়ী JSON উত্তর দাও।`;
}

function parseCodexResult(output: string): SplitResult {
  const parsed = JSON.parse(output) as SplitResult;
  if (!Array.isArray(parsed?.ideas)) throw new Error("Codex returned no ideas array");
  if (parsed.ideaCount !== parsed.ideas.length) {
    throw new Error("Codex returned an inconsistent ideaCount");
  }
  return parsed;
}

export async function splitIdeas(rawText: string): Promise<SplitResult> {
  try {
    const output = await runCodex(buildPrompt(rawText), { schema: splitResultSchema });
    return parseCodexResult(output);
  } catch (err) {
    console.error("Codex split failed, falling back to Gemini:", err);
    return splitIdeasWithGemini(rawText);
  }
}
