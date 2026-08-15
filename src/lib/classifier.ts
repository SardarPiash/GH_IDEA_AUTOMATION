import { runCodex } from "@/lib/codex";
import { splitIdeas as splitIdeasWithGemini } from "@/lib/gemini";
import { buildProposalPrompt, type IdeaSourceRow } from "@/lib/proposalPrompt";

export type SplitIdea = { title: string; summary: string };
export type SplitResult = { ideaCount: number; ideas: SplitIdea[] };
export type SplitSource = "codex" | "gemini";
export type SplitProgress = { stage: "codex" | "gemini" | "done"; message: string };
export type { IdeaSourceRow };

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

function parseCodexResult(output: string): SplitResult {
  const parsed = JSON.parse(output) as SplitResult;
  if (!Array.isArray(parsed?.ideas)) throw new Error("Codex returned no ideas array");
  if (parsed.ideaCount !== parsed.ideas.length) {
    throw new Error("Codex returned an inconsistent ideaCount");
  }
  for (const idea of parsed.ideas) {
    if (!idea.title?.trim() || !idea.summary?.trim()) {
      throw new Error("Codex returned an empty title or document");
    }
  }
  return parsed;
}

export async function splitIdeas(
  row: IdeaSourceRow,
  onProgress?: (event: SplitProgress) => void
): Promise<SplitResult & { source: SplitSource }> {
  onProgress?.({ stage: "codex", message: "Codex running…" });
  try {
    const output = await runCodex(buildProposalPrompt(row), { schema: splitResultSchema });
    const parsed = parseCodexResult(output);
    onProgress?.({ stage: "done", message: "Codex finished" });
    return { ...parsed, source: "codex" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("Codex split failed, falling back to Gemini:", err);
    onProgress?.({
      stage: "gemini",
      message: `Codex failed. Falling back to Gemini… (${reason.slice(0, 180)})`,
    });
    const parsed = await splitIdeasWithGemini(row);
    onProgress?.({ stage: "done", message: "Gemini finished" });
    return { ...parsed, source: "gemini" };
  }
}
