import { getAllSubmissions, type SubmissionRow } from "@/lib/sheets";
import { parseSplitResult, type StoredIdea } from "@/lib/split";

export type SentIdeaItem = {
  row: SubmissionRow;
  idea: StoredIdea;
  ideaIndex: number;
};

function rowFullySent(row: SubmissionRow): boolean {
  return (row.status || "").trim().toLowerCase() === "sent";
}

export function isIdeaAlreadySent(row: SubmissionRow, idea: StoredIdea): boolean {
  return Boolean(idea.sent) || rowFullySent(row);
}

export async function listSentIdeas(): Promise<SentIdeaItem[]> {
  const rows = await getAllSubmissions();
  const items: SentIdeaItem[] = [];
  for (const row of rows) {
    const parsed = parseSplitResult(row.splitResultJson);
    if (!parsed) continue;
    parsed.ideas.forEach((idea, ideaIndex) => {
      if (isIdeaAlreadySent(row, idea)) {
        items.push({ row, idea, ideaIndex });
      }
    });
  }
  return items;
}
