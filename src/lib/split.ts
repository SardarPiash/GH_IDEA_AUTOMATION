export type StoredIdea = {
  title: string;
  summary: string;
  teamEmail?: string;
  ccSubmitter?: boolean;
  assignedToGhSite?: boolean;
  sent?: boolean;
};

export type StoredSplitResult = {
  ideaCount: number;
  ideas: StoredIdea[];
};

export function parseSplitResult(json: string): StoredSplitResult | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed?.ideas)) return null;
    return {
      ideaCount: parsed.ideaCount ?? parsed.ideas.length,
      ideas: parsed.ideas,
    };
  } catch {
    return null;
  }
}
