"use client";

import { useEffect, useMemo, useState } from "react";
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

type Tab = "pending" | "reviewed";

const pageStyle: React.CSSProperties = {
  maxWidth: 920,
  margin: "0 auto",
  padding: "28px 24px 64px",
};

const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
  padding: 20,
  marginBottom: 16,
};

export default function SplitIdeasPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ideasByRow, setIdeasByRow] = useState<Record<number, EditableIdea[]>>({});
  const [tab, setTab] = useState<Tab>("pending");

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
      setTab("reviewed");
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

  const counts = useMemo(() => {
    let pending = 0;
    let reviewed = 0;
    for (const row of rows) {
      for (const idea of ideasByRow[row.rowNumber] ?? []) {
        if (idea.sent) reviewed += 1;
        else pending += 1;
      }
    }
    return { pending, reviewed };
  }, [rows, ideasByRow]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <p style={{ color: "var(--muted)" }}>Loading split ideas…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Split ideas</h1>
        <div style={{ ...cardStyle, background: "var(--danger-bg)", borderColor: "#fecaca" }}>
          <strong>Couldn’t load the sheet</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{loadError}</pre>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Split ideas</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 14, maxWidth: 640 }}>
          Review generated proposals, send them to the owning team, or reopen items that
          have already been handed over.
        </p>
      </div>

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "#e8edf3",
          borderRadius: 10,
          width: "fit-content",
          marginBottom: 20,
        }}
      >
        <TabButton
          active={tab === "pending"}
          onClick={() => setTab("pending")}
          label="Not reviewed"
          count={counts.pending}
        />
        <TabButton
          active={tab === "reviewed"}
          onClick={() => setTab("reviewed")}
          label="Reviewed"
          count={counts.reviewed}
        />
      </div>

      {rows.length === 0 && (
        <div style={cardStyle}>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No split ideas yet.{" "}
            <Link href="/">Split a submission from Inbox</Link>
          </p>
        </div>
      )}

      {rows.map((row) => {
        const ideas = (ideasByRow[row.rowNumber] ?? [])
          .map((idea, index) => ({ idea, index }))
          .filter(({ idea }) => (tab === "reviewed" ? idea.sent : !idea.sent));
        if (ideas.length === 0) return null;

        return (
          <section key={`${row.rowNumber}-${tab}`} style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{row.name || "Unknown submitter"}</div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                  PIN {row.pin || "—"} · {row.timestamp || "No date"}
                </div>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: tab === "reviewed" ? "var(--success-bg)" : "var(--accent-bg)",
                  color: tab === "reviewed" ? "var(--success)" : "var(--primary)",
                }}
              >
                {tab === "reviewed" ? "Sent" : "Awaiting send"}
              </span>
            </div>

            <details style={{ marginBottom: 14 }}>
              <summary
                style={{
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Original submission
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: 13,
                  background: "#f8fafc",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  margin: "8px 0 0",
                  color: "#334155",
                }}
              >
                {row.rawIdeaText}
              </pre>
            </details>

            <div style={{ display: "grid", gap: 14 }}>
              {ideas.map(({ idea, index }) => (
                <article
                  key={index}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 14,
                    background: "#fbfcfe",
                  }}
                >
                  <input
                    value={idea.title}
                    readOnly={idea.sent}
                    onChange={(e) => updateIdea(row.rowNumber, index, { title: e.target.value })}
                    onBlur={() => handleBlur(row.rowNumber)}
                    style={{
                      fontWeight: 700,
                      width: "100%",
                      marginBottom: 8,
                      fontSize: 15,
                      background: idea.sent ? "#f8fafc" : "#fff",
                    }}
                  />
                  <textarea
                    value={idea.summary}
                    readOnly={idea.sent}
                    onChange={(e) => updateIdea(row.rowNumber, index, { summary: e.target.value })}
                    onBlur={() => handleBlur(row.rowNumber)}
                    rows={16}
                    style={{
                      width: "100%",
                      marginBottom: 12,
                      fontSize: 13,
                      lineHeight: 1.5,
                      resize: "vertical",
                      background: idea.sent ? "#f8fafc" : "#fff",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      placeholder="team@company.com"
                      value={idea.teamEmail ?? ""}
                      readOnly={idea.sent}
                      onChange={(e) =>
                        updateIdea(row.rowNumber, index, { teamEmail: e.target.value })
                      }
                      onBlur={() => handleBlur(row.rowNumber)}
                      style={{ flex: "1 1 240px", minWidth: 200, background: idea.sent ? "#f8fafc" : "#fff" }}
                    />
                    {tab === "pending" && (
                      <button
                        className="primary"
                        onClick={() => handleSend(row, index)}
                        disabled={idea.sending || idea.sent}
                      >
                        {idea.sending ? "Sending…" : "Send to team"}
                      </button>
                    )}
                    <button type="button" onClick={() => handleDownload(row, index)}>
                      Download .docx
                    </button>
                  </div>
                  {idea.sent && idea.teamEmail && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--success)", fontWeight: 600 }}>
                      Handed over to {idea.teamEmail}
                    </div>
                  )}
                  {idea.error && (
                    <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{idea.error}</div>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {rows.length > 0 &&
        ((tab === "pending" && counts.pending === 0) ||
          (tab === "reviewed" && counts.reviewed === 0)) && (
          <div style={{ ...cardStyle, color: "var(--muted)" }}>
            {tab === "pending"
              ? "No unsent ideas. Sent items are in Reviewed."
              : "No sent ideas yet. Items move here after Send to team."}
          </div>
        )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        border: "none",
        background: active ? "#fff" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
        color: active ? "var(--text)" : "var(--muted)",
        padding: "8px 14px",
        borderRadius: 8,
      }}
    >
      {label}
      <span
        style={{
          marginLeft: 8,
          fontSize: 12,
          background: active ? "var(--accent-bg)" : "#dbe3ee",
          color: active ? "var(--primary)" : "var(--muted)",
          borderRadius: 999,
          padding: "1px 7px",
        }}
      >
        {count}
      </span>
    </button>
  );
}
