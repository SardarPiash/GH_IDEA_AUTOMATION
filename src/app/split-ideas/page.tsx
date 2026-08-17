"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSplitResult, type StoredIdea } from "@/lib/split";

type SubmissionRow = {
  rowNumber: number;
  timestamp: string;
  email: string;
  name: string;
  pin: string;
  rawIdeaText: string;
  status: string;
  splitResultJson: string;
};

type SortField = "name" | "pin" | "email" | "timestamp";
type SortDir = "asc" | "desc";

type EditableIdea = StoredIdea & {
  sending: boolean;
  error?: string;
};

type Tab = "pending" | "reviewed";

type AutoSplitState = {
  enabled: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  currentRow: number | null;
  currentName: string | null;
  currentMessage: string | null;
  pendingCount: number;
};

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

function ideasFromRow(row: SubmissionRow): EditableIdea[] | null {
  const parsed = parseSplitResult(row.splitResultJson);
  if (!parsed) return null;
  return parsed.ideas.map((idea) => ({
    title: idea.title ?? "",
    summary: idea.summary ?? "",
    teamEmail: idea.teamEmail ?? "",
    sent: Boolean(idea.sent) || row.status === "sent",
    sending: false,
  }));
}

export default function SplitIdeasPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ideasByRow, setIdeasByRow] = useState<Record<number, EditableIdea[]>>({});
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [autoSplit, setAutoSplit] = useState<AutoSplitState | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const dirtyRows = useRef(new Set<number>());

  const applyRows = useCallback((nextRows: SubmissionRow[]) => {
    setRows(nextRows);
    setIdeasByRow((prev) => {
      const next = { ...prev };
      for (const row of nextRows) {
        if (dirtyRows.current.has(row.rowNumber) && next[row.rowNumber]) continue;
        const ideas = ideasFromRow(row);
        if (ideas) next[row.rowNumber] = ideas;
      }
      return next;
    });
  }, []);

  const fetchRows = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    const res = await fetch("/api/ideas?status=split");
    const data = await res.json();
    if (data.error) {
      if (!silent) {
        setLoadError(data.error);
        setRows([]);
        setLoading(false);
      }
      return;
    }
    applyRows(data.rows ?? []);
    if (!silent) setLoading(false);
  }, [applyRows]);

  const fetchAutoSplit = useCallback(async () => {
    const res = await fetch("/api/auto-split");
    const data = await res.json();
    if (!data.error) setAutoSplit(data);
  }, []);

  useEffect(() => {
    void fetchRows();
    void fetchAutoSplit();
  }, [fetchRows, fetchAutoSplit]);

  useEffect(() => {
    const enabled = Boolean(autoSplit?.enabled);
    const ideasMs = enabled ? 4000 : 15000;
    const statusMs = enabled ? 2500 : 8000;
    const ideasTimer = setInterval(() => {
      void fetchRows(true);
    }, ideasMs);
    const statusTimer = setInterval(() => {
      void fetchAutoSplit();
    }, statusMs);
    return () => {
      clearInterval(ideasTimer);
      clearInterval(statusTimer);
    };
  }, [autoSplit?.enabled, fetchRows, fetchAutoSplit]);

  async function handleToggle() {
    if (!autoSplit || toggleBusy) return;
    setToggleBusy(true);
    try {
      const res = await fetch("/api/auto-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !autoSplit.enabled }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAutoSplit(data);
    } catch (err: any) {
      alert(`Could not update auto-split: ${err.message}`);
    } finally {
      setToggleBusy(false);
    }
  }

  function updateIdea(rowNumber: number, index: number, patch: Partial<EditableIdea>) {
    dirtyRows.current.add(rowNumber);
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
    dirtyRows.current.delete(rowNumber);
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
      dirtyRows.current.delete(row.rowNumber);
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

  const needle = query.trim().toLowerCase();

  const matchingRows = useMemo(() => {
    if (!needle) return rows;
    return rows.filter((row) => {
      const hay = `${row.name} ${row.pin} ${row.email}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, needle]);

  const visibleIdeas = useMemo(() => {
    const items: { row: SubmissionRow; idea: EditableIdea; index: number }[] = [];
    for (const row of matchingRows) {
      for (const [index, idea] of (ideasByRow[row.rowNumber] ?? []).entries()) {
        if (tab === "reviewed" ? idea.sent : !idea.sent) {
          items.push({ row, idea, index });
        }
      }
    }
    const dir = sortDir === "asc" ? 1 : -1;
    items.sort((a, b) => {
      const av = a.row[sortBy] ?? "";
      const bv = b.row[sortBy] ?? "";
      if (sortBy === "pin") {
        const an = Number(String(av).replace(/\D/g, ""));
        const bn = Number(String(bv).replace(/\D/g, ""));
        if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return (an - bn) * dir;
      }
      if (sortBy === "timestamp") {
        const at = Date.parse(av) || 0;
        const bt = Date.parse(bv) || 0;
        if (at !== bt) return (at - bt) * dir;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp * dir;
      return a.row.rowNumber - b.row.rowNumber || a.index - b.index;
    });
    return items;
  }, [matchingRows, ideasByRow, tab, sortBy, sortDir]);

  const counts = useMemo(() => {
    let pending = 0;
    let reviewed = 0;
    for (const row of matchingRows) {
      for (const idea of ideasByRow[row.rowNumber] ?? []) {
        if (idea.sent) reviewed += 1;
        else pending += 1;
      }
    }
    return { pending, reviewed };
  }, [matchingRows, ideasByRow]);

  const enabled = Boolean(autoSplit?.enabled);
  const statusText = enabled
    ? autoSplit?.currentMessage ||
      (autoSplit?.pendingCount
        ? `${autoSplit.pendingCount} new submission${autoSplit.pendingCount === 1 ? "" : "s"} waiting`
        : "Watching the sheet for new submissions")
    : "Turn this on to split new sheet submissions automatically";

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Split ideas</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 14, maxWidth: 560 }}>
            New sheet submissions are split here automatically. Each idea opens in its
            own edit box, stacked one under another.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={enabled}
            disabled={toggleBusy || !autoSplit}
            onClick={() => void handleToggle()}
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            Auto-split {enabled ? "On" : "Off"}
          </button>
          <div style={{ fontSize: 12, color: enabled ? "var(--success)" : "var(--muted)", maxWidth: 280, textAlign: "right" }}>
            {toggleBusy ? "Updating…" : statusText}
          </div>
        </div>
      </div>

      {autoSplit?.lastError && (
        <div style={{ ...cardStyle, background: "var(--danger-bg)", borderColor: "#fecaca", padding: 14 }}>
          <strong>Auto-split error:</strong> {autoSplit.lastError}
        </div>
      )}

      {enabled && autoSplit?.currentRow && (
        <section style={{ ...cardStyle, background: "var(--accent-bg)", borderColor: "#bfdbfe" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Splitting now · {autoSplit.currentName || `Row ${autoSplit.currentRow}`}
          </div>
          <div style={{ color: "var(--primary)", fontSize: 13 }}>{autoSplit.currentMessage}</div>
        </section>
      )}

      <div className="toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, PIN, or email"
          aria-label="Search by name, PIN, or email"
          style={{ flex: "1 1 240px", minWidth: 200 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
          Sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            aria-label="Sort by"
          >
            <option value="timestamp">Date</option>
            <option value="name">Name</option>
            <option value="pin">PIN</option>
            <option value="email">Email</option>
          </select>
        </label>
        <div role="group" aria-label="Sort direction" style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className={sortDir === "asc" ? "primary" : undefined}
            aria-pressed={sortDir === "asc"}
            onClick={() => setSortDir("asc")}
          >
            Asc
          </button>
          <button
            type="button"
            className={sortDir === "desc" ? "primary" : undefined}
            aria-pressed={sortDir === "desc"}
            onClick={() => setSortDir("desc")}
          >
            Desc
          </button>
        </div>
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

      {visibleIdeas.length === 0 && (
        <div style={cardStyle}>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            {rows.length === 0
              ? enabled
                ? "No split ideas yet. When a new submission lands in the sheet, it will appear here automatically."
                : "No split ideas yet. Turn Auto-split on to process new sheet submissions."
              : needle
                ? `No ideas match “${query.trim()}”.`
                : tab === "pending"
                  ? "No unsent ideas. Sent items are in Reviewed."
                  : "No sent ideas yet. Items move here after Send to team."}
          </p>
        </div>
      )}

      {visibleIdeas.map(({ row, idea, index }) => (
        <article key={`${row.rowNumber}-${index}`} style={cardStyle}>
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
                PIN {row.pin || "—"} · {row.email || "No email"} · {row.timestamp || "No date"}
              </div>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: 999,
                background: idea.sent ? "var(--success-bg)" : "var(--accent-bg)",
                color: idea.sent ? "var(--success)" : "var(--primary)",
              }}
            >
              {idea.sent ? "Sent" : "Awaiting send"}
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
              onChange={(e) => updateIdea(row.rowNumber, index, { teamEmail: e.target.value })}
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
