export type SplitIdea = {
  title: string;
  summary: string;
};

export type SplitResult = {
  ideaCount: number;
  ideas: SplitIdea[];
};

function buildPrompt(rawText: string): string {
  // Same prompt validated in Apps Script — unchanged, just moved into Node.
  return `তুমি একটি idea-review সহকারী। নিচের টেক্সটে একজন কর্মী একটি ফর্মে তার আইডিয়া লিখেছে। এই টেক্সটে এক বা একাধিক আলাদা আইডিয়া থাকতে পারে।

গুরুত্বপূর্ণ নিয়ম:
- যদি টেক্সটে নম্বরযুক্ত পয়েন্ট থাকে কিন্তু সেগুলো আসলে একটি মূল আইডিয়ার feature/sub-point হয় (একই লক্ষ্য অর্জনের জন্য একসাথে কাজ করে), তাহলে সেটি ১টি আইডিয়া হিসেবে গণনা করবে।
- যদি নম্বরযুক্ত পয়েন্টগুলো সত্যিকারের আলাদা, স্বাধীন আইডিয়া হয় (একটি ছাড়া আরেকটি বোঝা যায়, ভিন্ন সমস্যার সমাধান), তাহলে প্রতিটিকে আলাদা আইডিয়া হিসেবে গণনা করবে।

টেক্সট:
"""
${rawText}
"""

শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দাও, অন্য কোনো ব্যাখ্যা ছাড়া:
{
  "ideaCount": <সংখ্যা>,
  "ideas": [
    {
      "title": "<সংক্ষিপ্ত শিরোনাম>",
      "summary": "<পরিষ্কার, গোছানো বিবরণ - মূল ভাষাতেই>"
    }
  ]
}`;
}

export async function splitIdeas(rawText: string): Promise<SplitResult> {
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
      contents: [{ parts: [{ text: buildPrompt(rawText) }] }],
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

  // responseMimeType: "application/json" should give clean JSON, but strip
  // markdown fences defensively in case the model wraps it anyway.
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as SplitResult;
  return parsed;
}
