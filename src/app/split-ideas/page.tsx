"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseSplitResult, type StoredIdea } from "@/lib/split";

type SubmissionRow = {
  rowNumber: number;
  timestamp: string;
  name: string;
  pin: string;
  rawIdeaText: string;
  status: string;
  splitResultJson: string;
};

type EditableIdea = StoredIdea & {
  sending: boolean;
  error?: string;
};

export default function SplitIdeasPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ideasByRow, setIdeasByRow] = useState<Record<number, EditableIdea[]>>({});

  useEffect(() => {
    fetchRows();
  }, []);

  async function fetchRows() {
    setLoading(true);
    setLoadError(null);
    const res = await fetch("/api/ideas?status=split");
    const data = await res.json();
    if (data.error) {
      setLoadError(data.error);
      setRows([]);
      setLoading(false);
      return;
    }
    const nextRows: SubmissionRow[] = data.rows ?? [];
    setRows(nextRows);

    const cached: Record<number, EditableIdea[]> = {};
    for (const row of nextRows) {
      const parsed = parseSplitResult(row.splitResultJson);
      if (!parsed) continue;
      cached[row.rowNumber] = parsed.ideas.map((idea) => ({
        title: idea.title ?? "",
        summary: idea.summary ?? "",
        teamEmail: idea.teamEmail ?? "",
        sent: Boolean(idea.sent) || row.status === "sent",
        sending: false,
      }));
    }
    setIdeasByRow(cached);
    setLoading(false);
  }

  function updateIdea(rowNumber: number, index: number, patch: Partial<EditableIdea>) {
    setIdeasByRow((prev) => ({
      ...prev,
      [rowNumber]: prev[rowNumber].map((idea, i) => (i === index ? { ...idea, ...patch } : idea)),
    }));
  }

  function storedIdeas(ideas: EditableIdea[]): StoredIdea[] {
    return ideas.map(({ title, summary, teamEmail, sent }) => ({
      title,
      summary,
      teamEmail,
      sent,
    }));
  }

  async function persistEdits(rowNumber: number, ideas: EditableIdea[]) {
    const res = await fetch("/api/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowNumber, ideas: storedIdeas(ideas) }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  }

  async function handleBlur(rowNumber: number) {
    const ideas = ideasByRow[rowNumber];
    if (!ideas) return;
    try {
      await persistEdits(rowNumber, ideas);
    } catch (err: any) {
      alert(`Could not save edits: ${err.message}`);
    }
  }

  async function handleSend(row: SubmissionRow, index: number) {
    const idea = ideasByRow[row.rowNumber][index];
    if (!idea.teamEmail) {
      alert("Enter the team's email first.");
      return;
    }
    updateIdea(row.rowNumber, index, { sending: true, error: undefined });
    try {
      await persistEdits(row.rowNumber, ideasByRow[row.rowNumber]);
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowNumber: row.rowNumber,
          ideaIndex: index,
          to: idea.teamEmail,
          subject: `New idea: ${idea.title}`,
          body: `${idea.summary}\n\n— Submitted by ${row.name} (PIN ${row.pin}) on ${row.timestamp}`,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      updateIdea(row.rowNumber, index, { sending: false, sent: true });
      if (data.allSent) {
        setRows((prev) =>
          prev.map((r) => (r.rowNumber === row.rowNumber ? { ...r, status: "sent" } : r))
        );
      }
    } catch (err: any) {
      updateIdea(row.rowNumber, index, { sending: false, error: err.message });
    }
  }

  async function handleDownload(row: SubmissionRow, index: number) {
    try {
      await persistEdits(row.rowNumber, ideasByRow[row.rowNumber]);
      window.location.href = `/api/docx?rowNumber=${row.rowNumber}&ideaIndex=${index}`;
    } catch (err: any) {
      alert(`Could not download: ${err.message}`);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading split ideas…</div>;

  if (loadError) {
    return (
      <div style={{ padding: 24, maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>Split Ideas Dashboard</h1>
        <div
          style={{
            background: "#fdecea",
            border: "1px solid #f5c2c0",
            borderRadius: 8,
            padding: 16,
            color: "#7a1f1a",
            marginTop: 16,
          }}
        >
          <strong>Couldn't load the sheet:</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{loadError}</pre>
        </div>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Split Ideas Dashboard</h1>
      <p style={{ color: "#555", marginTop: 0, marginBottom: 16, fontSize: 14 }}>
        Gemini-split ideas. Each idea has a Word file you can download here.
        Send also attaches that same .docx to the email.
      </p>

      {rows.length === 0 && (
        <p>
          No split ideas yet.{" "}
          <Link href="/">Split a submission from Idea Review →</Link>
        </p>
      )}

      {rows.map((row) => {
        const ideas = ideasByRow[row.rowNumber] ?? [];
        const allSent = row.status === "sent" || (ideas.length > 0 && ideas.every((idea) => idea.sent));
        return (
          <section
            key={row.rowNumber}
            style={{
              background: "white",
              border: "1px solid #e2e2e5",
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>
              Split from {row.name} · PIN {row.pin} · {row.timestamp}{" "}
              {allSent && <strong style={{ color: "#0a7d2c" }}>· all sent</strong>}
              {!allSent && row.status === "split" && (
                <strong style={{ color: "#1d4ed8" }}>· split</strong>
              )}
            </div>

            <div style={{ fontSize: 12, color: "#888", marginBottom: 4, fontWeight: 650 }}>
              Original idea
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: 14,
                background: "#f4f4f5",
                borderRadius: 8,
                padding: 12,
                marginTop: 0,
              }}
            >
              {row.rawIdeaText}
            </pre>

            <div style={{ fontSize: 12, color: "#888", margin: "12px 0 8px", fontWeight: 650 }}>
              Split into {ideas.length} idea{ideas.length === 1 ? "" : "s"}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {ideas.map((idea, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  <input
                    value={idea.title}
                    onChange={(e) => updateIdea(row.rowNumber, i, { title: e.target.value })}
                    onBlur={() => handleBlur(row.rowNumber)}
                    style={{ fontWeight: 600, width: "100%", marginBottom: 6, padding: 4 }}
                  />
                  <textarea
                    value={idea.summary}
                    onChange={(e) => updateIdea(row.rowNumber, i, { summary: e.target.value })}
                    onBlur={() => handleBlur(row.rowNumber)}
                    rows={4}
                    style={{ width: "100%", padding: 6, marginBottom: 8 }}
                  />
                  <input
                    placeholder="team@company.com"
                    value={idea.teamEmail ?? ""}
                    onChange={(e) => updateIdea(row.rowNumber, i, { teamEmail: e.target.value })}
                    onBlur={() => handleBlur(row.rowNumber)}
                    style={{ width: "60%", padding: 4, marginRight: 8 }}
                  />
                  <button
                    onClick={() => handleSend(row, i)}
                    disabled={idea.sending || idea.sent}
                  >
                    {idea.sent ? "Sent ✓" : idea.sending ? "Sending…" : "Send"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(row, i)}
                    style={{ marginLeft: 8 }}
                  >
                    Download .docx
                  </button>
                  {idea.error && (
                    <div style={{ color: "crimson", fontSize: 13 }}>{idea.error}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
