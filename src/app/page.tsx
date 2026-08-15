"use client";

import { useEffect, useState } from "react";

type SubmissionRow = {
  rowNumber: number;
  timestamp: string;
  name: string;
  pin: string;
  rawIdeaText: string;
  status: string;
  splitResultJson: string;
};

type SplitIdea = { title: string; summary: string };

type EditableIdea = SplitIdea & {
  teamEmail: string;
  sending: boolean;
  sent: boolean;
  error?: string;
};

export default function ReviewPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<number | null>(null);
  const [ideasByRow, setIdeasByRow] = useState<Record<number, EditableIdea[]>>({});

  useEffect(() => {
    fetchRows();
  }, []);

  async function fetchRows() {
    setLoading(true);
    setLoadError(null);
    const res = await fetch("/api/ideas");
    const data = await res.json();
    if (data.error) {
      setLoadError(data.error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(data.rows ?? []);

    // Pre-populate any rows that already have a cached split result.
    const cached: Record<number, EditableIdea[]> = {};
    for (const row of data.rows ?? []) {
      if (row.splitResultJson) {
        try {
          const parsed = JSON.parse(row.splitResultJson);
          cached[row.rowNumber] = parsed.ideas.map((i: SplitIdea) => ({
            ...i,
            teamEmail: "",
            sending: false,
            sent: row.status === "sent",
          }));
        } catch {
          /* ignore malformed cache */
        }
      }
    }
    setIdeasByRow(cached);
    setLoading(false);
  }

  async function handleSplit(row: SubmissionRow) {
    setSplitting(row.rowNumber);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber: row.rowNumber, rawText: row.rawIdeaText }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setIdeasByRow((prev) => ({
        ...prev,
        [row.rowNumber]: data.ideas.map((i: SplitIdea) => ({
          ...i,
          teamEmail: "",
          sending: false,
          sent: false,
        })),
      }));
    } catch (err: any) {
      alert(`Split failed: ${err.message}`);
    } finally {
      setSplitting(null);
    }
  }

  function updateIdea(rowNumber: number, index: number, patch: Partial<EditableIdea>) {
    setIdeasByRow((prev) => ({
      ...prev,
      [rowNumber]: prev[rowNumber].map((idea, i) => (i === index ? { ...idea, ...patch } : idea)),
    }));
  }

  async function handleSend(row: SubmissionRow, index: number) {
    const idea = ideasByRow[row.rowNumber][index];
    if (!idea.teamEmail) {
      alert("Enter the team's email first.");
      return;
    }
    updateIdea(row.rowNumber, index, { sending: true, error: undefined });
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowNumber: row.rowNumber,
          to: idea.teamEmail,
          subject: `New idea: ${idea.title}`,
          body: `${idea.summary}\n\n— Submitted by ${row.name} (PIN ${row.pin}) on ${row.timestamp}`,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      updateIdea(row.rowNumber, index, { sending: false, sent: true });
    } catch (err: any) {
      updateIdea(row.rowNumber, index, { sending: false, error: err.message });
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading submissions…</div>;

  if (loadError) {
    return (
      <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>Idea Review & Routing</h1>
        <div style={{ background: "#fdecea", border: "1px solid #f5c2c0", borderRadius: 8, padding: 16, color: "#7a1f1a", marginTop: 16 }}>
          <strong>Couldn't load the sheet:</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{loadError}</pre>
        </div>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Idea Review & Routing</h1>

      {rows.length === 0 && <p>No submissions found in the sheet.</p>}

      {rows.map((row) => {
        const ideas = ideasByRow[row.rowNumber];
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
              {row.name} · PIN {row.pin} · {row.timestamp}{" "}
              {row.status === "sent" && <strong style={{ color: "#0a7d2c" }}>· all sent</strong>}
            </div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14 }}>
              {row.rawIdeaText}
            </pre>

            {!ideas && (
              <button onClick={() => handleSplit(row)} disabled={splitting === row.rowNumber}>
                {splitting === row.rowNumber ? "Splitting…" : "Split into ideas"}
              </button>
            )}

            {ideas && (
              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                {ideas.map((idea, i) => (
                  <div
                    key={i}
                    style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fafafa" }}
                  >
                    <input
                      value={idea.title}
                      onChange={(e) => updateIdea(row.rowNumber, i, { title: e.target.value })}
                      style={{ fontWeight: 600, width: "100%", marginBottom: 6, padding: 4 }}
                    />
                    <textarea
                      value={idea.summary}
                      onChange={(e) => updateIdea(row.rowNumber, i, { summary: e.target.value })}
                      rows={4}
                      style={{ width: "100%", padding: 6, marginBottom: 8 }}
                    />
                    <input
                      placeholder="team@company.com"
                      value={idea.teamEmail}
                      onChange={(e) => updateIdea(row.rowNumber, i, { teamEmail: e.target.value })}
                      style={{ width: "60%", padding: 4, marginRight: 8 }}
                    />
                    <button onClick={() => handleSend(row, i)} disabled={idea.sending || idea.sent}>
                      {idea.sent ? "Sent ✓" : idea.sending ? "Sending…" : "Send"}
                    </button>
                    {idea.error && <div style={{ color: "crimson", fontSize: 13 }}>{idea.error}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
