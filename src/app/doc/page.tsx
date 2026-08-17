import { getSubmission } from "@/lib/sheets";
import { parseSplitResult } from "@/lib/split";
import { markdownToHtml } from "@/lib/markdownHtml";

export const dynamic = "force-dynamic";

function firstQuery(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DocPreviewPage({
  searchParams,
}: {
  searchParams: { rowNumber?: string; ideaIndex?: string };
}) {
  const rowNumber = Number(firstQuery(searchParams.rowNumber));
  const ideaIndex = Number(firstQuery(searchParams.ideaIndex));

  if (!rowNumber || Number.isNaN(ideaIndex)) {
    return (
      <main className="doc-preview">
        <p>Missing rowNumber or ideaIndex.</p>
      </main>
    );
  }

  const row = await getSubmission(rowNumber);
  if (!row) {
    return (
      <main className="doc-preview">
        <p>Submission not found.</p>
      </main>
    );
  }

  const idea = parseSplitResult(row.splitResultJson)?.ideas[ideaIndex];
  if (!idea) {
    return (
      <main className="doc-preview">
        <p>Split idea not found.</p>
      </main>
    );
  }

  const title = idea.title?.trim() || "Idea proposal";
  const markdown = idea.summary?.trim() || `# ${title}`;

  return (
    <main className="doc-preview">
      <article className="doc-paper">
        <div className="doc-meta">
          {row.name || "Unknown submitter"} · PIN {row.pin || "—"} · {row.timestamp || "No date"}
        </div>
        <div
          className="doc-body"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }}
        />
      </article>
    </main>
  );
}
