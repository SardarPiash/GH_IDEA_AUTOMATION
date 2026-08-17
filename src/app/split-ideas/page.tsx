"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { parseSplitResult, type StoredIdea } from "@/lib/split";
import EmailChips from "@/components/EmailChips";
import { isValidEmail, parseEmails, formatEmails } from "@/lib/emails";
import { GH_SITE_TEAM, isGhSiteAssigned } from "@/lib/teamEmails";

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
type IdeaQueue = "review" | "gh-site";

type AutoSplitState = {
  enabled: boolean;
  ackEmailEnabled: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  currentRow: number | null;
  currentName: string | null;
  currentMessage: string | null;
  pendingCount: number;
};

function ideasFromRow(row: SubmissionRow): EditableIdea[] | null {
  const parsed = parseSplitResult(row.splitResultJson);
  if (!parsed) return null;
  return parsed.ideas.map((idea) => ({
    title: idea.title ?? "",
    summary: idea.summary ?? "",
    teamEmail: idea.teamEmail ?? "",
    ccSubmitter: Boolean(idea.ccSubmitter),
    assignedToGhSite: Boolean(idea.assignedToGhSite),
    sent: Boolean(idea.sent) || row.status === "sent",
    sending: false,
  }));
}

export default function SplitIdeasPage() {
  return <SplitIdeasBoard queue="review" />;
}

export function SplitIdeasBoard({ queue }: { queue: IdeaQueue }) {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <p style={{ color: "var(--muted)" }}>
            {queue === "gh-site" ? "Loading GH site assignments…" : "Loading split ideas…"}
          </p>
        </main>
      }
    >
      <SplitIdeasPageInner queue={queue} />
    </Suspense>
  );
}

function SplitIdeasPageInner({ queue }: { queue: IdeaQueue }) {
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
  const ideasByRowRef = useRef<Record<number, EditableIdea[]>>({});
  const focusedOnce = useRef(false);
  const scrolledOnce = useRef(false);
  const searchParams = useSearchParams();
  const focusRow = Number(searchParams.get("row") || 0) || null;

  const applyRows = useCallback((nextRows: SubmissionRow[]) => {
    setRows(nextRows);
    setIdeasByRow((prev) => {
      const next = { ...prev };
      for (const row of nextRows) {
        const incoming = ideasFromRow(row);
        if (!incoming) continue;
        const local = next[row.rowNumber];
        if (local && dirtyRows.current.has(row.rowNumber)) {
          const serverMatches = local.every((idea, i) => {
            const remote = incoming[i];
            return (
              remote &&
              (idea.teamEmail ?? "") === (remote.teamEmail ?? "") &&
              Boolean(idea.ccSubmitter) === Boolean(remote.ccSubmitter) &&
              Boolean(idea.assignedToGhSite) === Boolean(remote.assignedToGhSite) &&
              idea.title === remote.title &&
              idea.summary === remote.summary
            );
          });
          if (!serverMatches) {
            next[row.rowNumber] = incoming.map((idea, i) => {
              const prevIdea = local[i];
              if (!prevIdea) return idea;
              return {
                ...idea,
                title: prevIdea.title,
                summary: prevIdea.summary,
                teamEmail: prevIdea.teamEmail,
                ccSubmitter: prevIdea.ccSubmitter,
                assignedToGhSite: prevIdea.assignedToGhSite,
                sending: prevIdea.sending,
                error: prevIdea.error,
              };
            });
            continue;
          }
          dirtyRows.current.delete(row.rowNumber);
        }
        next[row.rowNumber] = incoming.map((idea, i) => ({
          ...idea,
          sending: local?.[i]?.sending ?? false,
          error: local?.[i]?.error,
        }));
      }
      ideasByRowRef.current = next;
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
    const current = ideasByRowRef.current[rowNumber] ?? ideasByRow[rowNumber];
    const nextIdeas = current.map((idea, i) => (i === index ? { ...idea, ...patch } : idea));
    ideasByRowRef.current = { ...ideasByRowRef.current, [rowNumber]: nextIdeas };
    setIdeasByRow((prev) => ({ ...prev, [rowNumber]: nextIdeas }));
  }

  function storedIdeas(ideas: EditableIdea[]): StoredIdea[] {
    return ideas.map(({ title, summary, teamEmail, ccSubmitter, assignedToGhSite, sent }) => ({
      title,
      summary,
      teamEmail,
      ccSubmitter,
      assignedToGhSite,
      sent,
    }));
  }

  async function persistEdits(rowNumber: number, ideas?: EditableIdea[]) {
    const payload = ideas ?? ideasByRowRef.current[rowNumber];
    if (!payload) return;
    const res = await fetch("/api/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowNumber, ideas: storedIdeas(payload) }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  }

  async function handleBlur(rowNumber: number) {
    const ideas = ideasByRowRef.current[rowNumber];
    if (!ideas) return;
    try {
      await persistEdits(rowNumber, ideas);
    } catch (err: any) {
      alert(`Could not save edits: ${err.message}`);
    }
  }

  async function handleSend(row: SubmissionRow, index: number) {
    const idea = ideasByRowRef.current[row.rowNumber]?.[index];
    if (!idea) return;
    const teamEmails = parseEmails(idea.teamEmail);
    if (!teamEmails.length) {
      alert("Enter at least one team email first.");
      return;
    }
    const bad = teamEmails.find((email) => !isValidEmail(email));
    if (bad) {
      alert(`Not a valid email: ${bad}`);
      return;
    }
    updateIdea(row.rowNumber, index, { sending: true, error: undefined });
    try {
      await persistEdits(row.rowNumber);
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowNumber: row.rowNumber,
          ideaIndex: index,
          to: teamEmails,
          ccSubmitter: Boolean(idea.ccSubmitter),
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

  async function handleAssignToGhSite(row: SubmissionRow, index: number) {
    const idea = ideasByRowRef.current[row.rowNumber]?.[index];
    if (!idea || idea.assignedToGhSite) return;
    const emails = parseEmails(idea.teamEmail);
    if (!emails.includes(GH_SITE_TEAM.email.toLowerCase())) {
      emails.push(GH_SITE_TEAM.email);
    }
    updateIdea(row.rowNumber, index, {
      assignedToGhSite: true,
      teamEmail: formatEmails(emails),
      error: undefined,
    });
    try {
      await persistEdits(row.rowNumber);
    } catch (err: any) {
      updateIdea(row.rowNumber, index, { assignedToGhSite: false, error: err.message });
    }
  }

  async function handleOpenInBrowser(row: SubmissionRow, index: number) {
    try {
      await persistEdits(row.rowNumber);
      window.open(
        `/doc?rowNumber=${row.rowNumber}&ideaIndex=${index}`,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (err: any) {
      alert(`Could not open document: ${err.message}`);
    }
  }

  async function handleDownload(row: SubmissionRow, index: number) {
    try {
      await persistEdits(row.rowNumber);
      window.location.href = `/api/pdf?rowNumber=${row.rowNumber}&ideaIndex=${index}`;
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

  const visibleSubmissionGroups = useMemo(() => {
    type IdeaEntry = { idea: EditableIdea; index: number };
    type SubmissionGroup = {
      row: SubmissionRow;
      ideas: IdeaEntry[];
      totalSplitCount: number;
    };

    const groups: SubmissionGroup[] = [];
    for (const row of matchingRows) {
      const allIdeas = ideasByRow[row.rowNumber] ?? [];
      const visible = allIdeas
        .map((idea, index) => ({ idea, index }))
        .filter(({ idea }) => {
          if (queue === "gh-site" ? !isGhSiteAssigned(idea) : isGhSiteAssigned(idea)) return false;
          return tab === "reviewed" ? idea.sent : !idea.sent;
        });
      if (visible.length === 0) continue;
      groups.push({ row, ideas: visible, totalSplitCount: allIdeas.length });
    }

    const dir = sortDir === "asc" ? 1 : -1;
    groups.sort((a, b) => {
      const av = a.row[sortBy] ?? "";
      const bv = b.row[sortBy] ?? "";
      if (sortBy === "pin") {
        const an = Number(String(av).replace(/\D/g, ""));
        const bn = Number(String(bv).replace(/\D/g, ""));
        if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return (an - bn) * dir;
      }
      if (sortBy === "timestamp") {
        const at = Date.parse(String(av)) || 0;
        const bt = Date.parse(String(bv)) || 0;
        if (at !== bt) return (at - bt) * dir;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp * dir;
      return a.row.rowNumber - b.row.rowNumber;
    });
    if (focusRow) {
      const idx = groups.findIndex((group) => group.row.rowNumber === focusRow);
      if (idx > 0) {
        const [focused] = groups.splice(idx, 1);
        groups.unshift(focused);
      }
    }
    return groups;
  }, [matchingRows, ideasByRow, tab, sortBy, sortDir, focusRow, queue]);

  const counts = useMemo(() => {
    let pending = 0;
    let reviewed = 0;
    for (const row of matchingRows) {
      for (const idea of ideasByRow[row.rowNumber] ?? []) {
        if (queue === "gh-site" ? !isGhSiteAssigned(idea) : isGhSiteAssigned(idea)) continue;
        if (idea.sent) reviewed += 1;
        else pending += 1;
      }
    }
    return { pending, reviewed };
  }, [matchingRows, ideasByRow, queue]);

  useEffect(() => {
    if (!focusRow || focusedOnce.current || loading) return;
    const ideas = ideasByRow[focusRow];
    if (!ideas?.length) return;
    focusedOnce.current = true;
    const inQueue = ideas.filter((idea) =>
      queue === "gh-site" ? isGhSiteAssigned(idea) : !isGhSiteAssigned(idea)
    );
    setTab(inQueue.some((idea) => !idea.sent) ? "pending" : "reviewed");
  }, [focusRow, ideasByRow, loading, queue]);

  useEffect(() => {
    if (!focusRow || loading || scrolledOnce.current) return;
    const el = document.getElementById(`submission-${focusRow}`);
    if (!el) return;
    scrolledOnce.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusRow, loading, tab, visibleSubmissionGroups.length]);

  const enabled = Boolean(autoSplit?.enabled);
  const statusText = enabled
    ? autoSplit?.currentMessage ||
      (autoSplit?.pendingCount
        ? `${autoSplit.pendingCount} new submission${autoSplit.pendingCount === 1 ? "" : "s"} waiting`
        : "Watching the sheet for new submissions")
    : "Turn this on to split new sheet submissions automatically";

  if (loading) {
    return (
      <main className="page-shell">
        <p className="page-kicker">{queue === "gh-site" ? "GH site team" : "Review"}</p>
        <p style={{ color: "var(--muted)" }}>
          {queue === "gh-site" ? "Loading GH site assignments…" : "Loading split ideas…"}
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page-shell">
        <h1>{queue === "gh-site" ? "Assigned to GH site team" : "Split ideas"}</h1>
        <div className="panel is-danger">
          <strong>Couldn’t load the sheet</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{loadError}</pre>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="page-hero">
        <div>
          <p className="page-kicker">{queue === "gh-site" ? "Assigned queue" : "Review queue"}</p>
          <h1>{queue === "gh-site" ? "Assigned to GH site team" : "Split ideas"}</h1>
          <p>
            {queue === "gh-site"
              ? "Ideas handed over from Split ideas for the GH site team. They no longer appear in the main review tabs."
              : "Review each split idea, send it to a team, or assign it to GH site to move it out of this queue."}
          </p>
        </div>
        {queue === "review" && (
        <div className="hero-actions">
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={enabled}
            disabled={toggleBusy || !autoSplit}
            onClick={() => void handleToggle()}
            style={{ width: "100%", justifyContent: "flex-start" }}
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            Auto-split <span className="switch-label">{enabled ? "On" : "Off"}</span>
          </button>
          <div className={`hero-note ${enabled ? "is-on" : "is-off"}`}>
            {toggleBusy ? "Updating…" : statusText}
          </div>
        </div>
        )}
      </div>

      {queue === "review" && autoSplit?.lastError && (
        <div className="panel is-danger">
          <strong>Auto-split error:</strong> {autoSplit.lastError}
        </div>
      )}

      {queue === "review" && enabled && autoSplit?.currentRow && (
        <section className="panel is-info">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Splitting now · {autoSplit.currentName || `Row ${autoSplit.currentRow}`}
          </div>
          <div style={{ color: "var(--primary)", fontSize: 13 }}>{autoSplit.currentMessage}</div>
        </section>
      )}

      <div className="metric-grid">
        <button
          type="button"
          className={`metric-card is-blue${tab === "pending" ? " is-active" : ""}`}
          onClick={() => setTab("pending")}
        >
          <div className="label">Not reviewed</div>
          <div className="value">{counts.pending}</div>
          <div className="hint">Waiting to send</div>
        </button>
        <button
          type="button"
          className={`metric-card is-green${tab === "reviewed" ? " is-active" : ""}`}
          onClick={() => setTab("reviewed")}
        >
          <div className="label">Reviewed</div>
          <div className="value">{counts.reviewed}</div>
          <div className="hint">Already handed over</div>
        </button>
      </div>

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

      <div className="tablist" role="tablist">
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

      {visibleSubmissionGroups.length === 0 && (
        <div className="panel">
          <p className="panel-empty">
            {rows.length === 0
              ? queue === "gh-site"
                ? "No ideas have been assigned to the GH site team yet."
                : enabled
                ? "No split ideas yet. When a new submission lands in the sheet, it will appear here automatically."
                : "No split ideas yet. Turn Auto-split on to process new sheet submissions."
              : needle
                ? `No ideas match “${query.trim()}”.`
                : queue === "gh-site"
                  ? tab === "pending"
                    ? "No assigned GH site ideas waiting to send."
                    : "No sent GH site ideas yet."
                  : tab === "pending"
                    ? "No unsent ideas. Sent items are in Reviewed. Assigned GH site items are on the GH site team page."
                    : "No sent ideas yet. Items move here after Send to team."}
          </p>
        </div>
      )}

      {visibleSubmissionGroups.map(({ row, ideas, totalSplitCount }) => {
        const isFocused = focusRow === row.rowNumber;
        return (
        <article
          key={row.rowNumber}
          id={`submission-${row.rowNumber}`}
          className={`panel${isFocused ? " is-focus" : ""}`}
        >
          <div className="card-head">
            <div>
              <div className="card-title">{row.name || "Unknown submitter"}</div>
              <div className="card-meta">
                PIN {row.pin || "—"} · {row.email || "No email"} · {row.timestamp || "No date"}
              </div>
            </div>
            <span className="badge badge-blue">
              {totalSplitCount} split idea{totalSplitCount === 1 ? "" : "s"}
            </span>
          </div>

          <details className="original-details">
            <summary>Original submission</summary>
            <pre>{row.rawIdeaText}</pre>
          </details>

          <div>
            {ideas.map(({ idea, index }) => (
              <section key={index} className="idea-box">
                <div className="card-head">
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    Split idea {index + 1} of {totalSplitCount}
                  </span>
                  <span className={idea.sent ? "badge badge-green" : "badge badge-blue"}>
                    {idea.sent ? "Sent" : "Awaiting send"}
                  </span>
                </div>

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
                <div style={{ display: "grid", gap: 8 }}>
                  <EmailChips
                    value={idea.teamEmail ?? ""}
                    readOnly={idea.sent}
                    placeholder="team@company.com"
                    onTyping={() => dirtyRows.current.add(row.rowNumber)}
                    onChange={(teamEmail) => updateIdea(row.rowNumber, index, { teamEmail })}
                    onBlur={() => handleBlur(row.rowNumber)}
                  />
                  {isValidEmail(row.email) && (
                    <label className="email-copy-check">
                      <input
                        type="checkbox"
                        checked={Boolean(idea.ccSubmitter)}
                        disabled={idea.sent}
                        onChange={(e) =>
                          updateIdea(row.rowNumber, index, { ccSubmitter: e.target.checked })
                        }
                        onBlur={() => handleBlur(row.rowNumber)}
                      />
                      <span>
                        Also send a copy to the submitter
                        <span className="email-copy-check-address"> ({row.email.trim()})</span>
                      </span>
                    </label>
                  )}
                  <div className="action-row">
                    {tab === "pending" && (
                      <button
                        className="primary"
                        onClick={() => handleSend(row, index)}
                        disabled={idea.sending || idea.sent}
                      >
                        {idea.sending ? "Sending…" : "Send to team"}
                      </button>
                    )}
                    <button type="button" onClick={() => handleOpenInBrowser(row, index)}>
                      Open in browser
                    </button>
                    <button type="button" onClick={() => handleDownload(row, index)}>
                      Download PDF
                    </button>
                    {queue === "review" && !idea.assignedToGhSite && (
                      <button
                        type="button"
                        onClick={() => void handleAssignToGhSite(row, index)}
                        disabled={idea.sending}
                      >
                        Assign to GH site
                      </button>
                    )}
                  </div>
                </div>
                {idea.sent && idea.teamEmail && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--success)", fontWeight: 600 }}>
                    Handed over to {idea.teamEmail}
                    {idea.ccSubmitter && isValidEmail(row.email)
                      ? ` · copy to ${row.email.trim()}`
                      : ""}
                  </div>
                )}
                {idea.error && (
                  <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{idea.error}</div>
                )}
              </section>
            ))}
          </div>
        </article>
        );
      })}
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
      className="tab-btn"
      aria-selected={active}
      onClick={onClick}
    >
      {label}
      <span className="tab-count">{count}</span>
    </button>
  );
}
