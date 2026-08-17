import { runCodex } from "@/lib/codex";
import { extractJsonText, runCursor } from "@/lib/cursor";
import { splitIdeas as splitIdeasWithGemini } from "@/lib/gemini";
import { buildProposalPrompt, type IdeaSourceRow } from "@/lib/proposalPrompt";

export type SplitIdea = { title: string; summary: string };
export type SplitResult = { ideaCount: number; ideas: SplitIdea[] };
export type SplitSource = "cursor" | "gemini" | "codex";
export type SplitProgress = {
  stage: "cursor" | "gemini" | "codex" | "done";
  message: string;
};
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

function parseSplitOutput(output: string, source: SplitSource): SplitResult {
  const parsed = JSON.parse(extractJsonText(output)) as SplitResult;
  if (!Array.isArray(parsed?.ideas)) throw new Error(`${source} returned no ideas array`);
  if (typeof parsed.ideaCount !== "number") parsed.ideaCount = parsed.ideas.length;
  if (parsed.ideaCount !== parsed.ideas.length) {
    throw new Error(`${source} returned an inconsistent ideaCount`);
  }
  for (const idea of parsed.ideas) {
    if (!idea.title?.trim() || !idea.summary?.trim()) {
      throw new Error(`${source} returned an empty title or document`);
    }
  }
  return parsed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function splitIdeas(
  row: IdeaSourceRow,
  onProgress?: (event: SplitProgress) => void
): Promise<SplitResult & { source: SplitSource }> {
  const prompt = buildProposalPrompt(row);
  const failures: string[] = [];

  onProgress?.({ stage: "cursor", message: "Cursor running…" });
  try {
    const { output, model } = await runCursor(prompt);
    const parsed = parseSplitOutput(output, "cursor");
    onProgress?.({ stage: "done", message: `Cursor finished (${model})` });
    return { ...parsed, source: "cursor" };
  } catch (err) {
    failures.push(`Cursor: ${errorMessage(err)}`);
    console.error("Cursor split failed, falling back to Gemini:", err);
    onProgress?.({
      stage: "gemini",
      message: `Cursor failed. Falling back to Gemini… (${errorMessage(err).slice(0, 180)})`,
    });
  }

  try {
    const parsed = await splitIdeasWithGemini(row);
    const validated = parseSplitOutput(JSON.stringify(parsed), "gemini");
    onProgress?.({ stage: "done", message: "Gemini finished" });
    return { ...validated, source: "gemini" };
  } catch (err) {
    failures.push(`Gemini: ${errorMessage(err)}`);
    console.error("Gemini split failed, falling back to Codex:", err);
    onProgress?.({
      stage: "codex",
      message: `Gemini failed. Falling back to Codex… (${errorMessage(err).slice(0, 180)})`,
    });
  }

  try {
    const output = await runCodex(prompt, { schema: splitResultSchema });
    const parsed = parseSplitOutput(output, "codex");
    onProgress?.({ stage: "done", message: "Codex finished" });
    return { ...parsed, source: "codex" };
  } catch (err) {
    failures.push(`Codex: ${errorMessage(err)}`);
    throw new Error(`All models failed. ${failures.join(" | ")}`);
  }
}
