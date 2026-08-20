"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseSplitResult } from "@/lib/split";
import { isGhSiteAssigned } from "@/lib/teamEmails";

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

type BoardStatus = "pending" | "split" | "sent";
type SortField = "name" | "pin" | "email" | "timestamp" | "status";
type SortDir = "asc" | "desc";
type SplitLog = { message: string; tone: "running" | "done" | "error" };

type WorkerState = {
  enabled: boolean;
  ackEmailEnabled: boolean;
  pendingCount?: number;
  lastRunAt?: string | null;
  lastError?: string | null;
  currentMessage?: string | null;
};

function boardStatus(row: SubmissionRow): BoardStatus {
  const status = (row.status || "").trim().toLowerCase();
  if (status === "sent") return "sent";
  if (status === "split" || Boolean(parseSplitResult(row.splitResultJson))) return "split";
  return "pending";
}

function statusLabel(status: BoardStatus) {
  if (status === "sent") return "Sent";
  if (status === "split") return "Split";
  return "Not split";
}

function badgeClass(status: BoardStatus) {
  if (status === "sent") return "badge badge-green";
  if (status === "split") return "badge badge-amber";
  return "badge badge-blue";
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export default function ShowboardPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<"all" | BoardStatus>("all");
  const [splitting, setSplitting] = useState<number | null>(null);
  const [logsByRow, setLogsByRow] = useState<Record<number, SplitLog[]>>({});
  const [workerState, setWorkerState] = useState<WorkerState | null>(null);
  const [ackToggleBusy, setAckToggleBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const fetchRows = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    const res = await fetch("/api/ideas?status=all");
    const data = await res.json();
    if (data.error) {
      if (!silent) {
        setLoadError(data.error);
        setRows([]);
        setLoading(false);
      }
      return;
    }
    setRows(data.rows ?? []);
    if (!silent) setLoading(false);
  }, []);

  const fetchWorkerState = useCallback(async () => {
    const res = await fetch("/api/auto-split");
    const data = await res.json();
    if (!data.error) {
      setWorkerState({
        enabled: Boolean(data.enabled),
        ackEmailEnabled: data.ackEmailEnabled !== false,
        pendingCount: data.pendingCount,
        lastRunAt: data.lastRunAt ?? null,
        lastError: data.lastError ?? null,
        currentMessage: data.currentMessage ?? null,
      });
    }
  }, []);

  useEffect(() => {
    void fetchRows();
    void fetchWorkerState();
  }, [fetchRows, fetchWorkerState]);

  async function handleAckEmailToggle() {
    if (!workerState || ackToggleBusy) return;
    setAckToggleBusy(true);
    try {
      const res = await fetch("/api/auto-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ackEmailEnabled: !workerState.ackEmailEnabled }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setWorkerState({
        enabled: Boolean(data.enabled),
        ackEmailEnabled: data.ackEmailEnabled !== false,
        pendingCount: data.pendingCount,
        lastRunAt: data.lastRunAt ?? null,
        lastError: data.lastError ?? null,
        currentMessage: data.currentMessage ?? null,
      });
    } catch (err: any) {
      alert(`Could not update thank-you email setting: ${err.message}`);
    } finally {
      setAckToggleBusy(false);
    }
  }

  async function handleReset() {
    if (resetBusy || splitting) return;
    const extra: string[] = [];
    if (workerState?.ackEmailEnabled) {
      extra.push("Thank-you emails will go out again if that setting stays on.");
    }
    if (workerState?.enabled) {
      extra.push("Auto-split is on, so pending ideas will start splitting again.");
    }
    const confirmed = window.confirm(
      [
        "Clear all split results, sent status, and thank-you flags? Original submissions stay. The board will look like a fresh start.",
        ...extra,
      ].join(" ")
    );
    if (!confirmed) return;

    setResetBusy(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLogsByRow({});
      setStatusFilter("all");
      await fetchRows(true);
      await fetchWorkerState();
    } catch (err: any) {
      alert(`Could not reset: ${err.message}`);
    } finally {
      setResetBusy(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (splitting) return;
      void fetchRows(true);
      void fetchWorkerState();
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchRows, fetchWorkerState, splitting]);

  function appendLog(rowNumber: number, message: string, tone: SplitLog["tone"] = "running") {
    setLogsByRow((prev) => ({
      ...prev,
      [rowNumber]: [...(prev[rowNumber] ?? []), { message, tone }],
    }));
  }

  async function handleSplit(row: SubmissionRow) {
    if (boardStatus(row) !== "pending") return;
    setSplitting(row.rowNumber);
    setLogsByRow((prev) => ({
      ...prev,
      [row.rowNumber]: [{ message: "Starting…", tone: "running" }],
    }));
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber: row.rowNumber }),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!res.body || !contentType.includes("ndjson")) {
        const data = await res.json();
        throw new Error(data.error || "Split failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as {
          type: string;
          message?: string;
          ideaCount?: number;
        };
        if (event.type === "error") throw new Error(event.message || "Split failed");
        if (event.type === "done") {
          finished = true;
          appendLog(
            row.rowNumber,
            event.message || `Finished — ${event.ideaCount ?? 0} idea(s) saved.`,
            "done"
          );
        } else if (event.message) {
          appendLog(row.rowNumber, event.message, "running");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      if (buffer.trim()) processLine(buffer);
      if (!finished) throw new Error("Split ended without a finished response");
      await fetchRows(true);
    } catch (err: any) {
      appendLog(row.rowNumber, `Failed: ${err.message}`, "error");
    } finally {
      setSplitting(null);
    }
  }

  const metrics = useMemo(() => {
    const next = {
      all: rows.length,
      pending: 0,
      split: 0,
      sent: 0,
      people: 0,
      today: 0,
      last7: 0,
      ideas: 0,
      ideasAwaiting: 0,
      ideasSent: 0,
      ghAssigned: 0,
      ghAwaiting: 0,
      ghSent: 0,
    };
    const people = new Set<string>();
    const today = startOfToday();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const row of rows) {
      next[boardStatus(row)] += 1;
      const person = (row.email || row.pin || row.name).trim().toLowerCase();
      if (person) people.add(person);
      const ts = Date.parse(row.timestamp);
      if (ts && ts >= today) next.today += 1;
      if (ts && ts >= weekAgo) next.last7 += 1;
      const parsed = parseSplitResult(row.splitResultJson);
      if (!parsed) continue;
      for (const idea of parsed.ideas) {
        next.ideas += 1;
        if (isGhSiteAssigned(idea)) {
          next.ghAssigned += 1;
          if (idea.sent) next.ghSent += 1;
          else next.ghAwaiting += 1;
        } else if (idea.sent) {
          next.ideasSent += 1;
        } else {
          next.ideasAwaiting += 1;
        }
      }
    }
    next.people = people.size;
    return next;
  }, [rows]);

  const needle = query.trim().toLowerCase();

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      const status = boardStatus(row);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!needle) return true;
      const hay = `${row.name} ${row.pin} ${row.email} ${row.rawIdeaText}`.toLowerCase();
      return hay.includes(needle);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortBy === "status" ? boardStatus(a) : a[sortBy] ?? "";
      const bv = sortBy === "status" ? boardStatus(b) : b[sortBy] ?? "";
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
      return a.rowNumber - b.rowNumber;
    });
  }, [rows, needle, sortBy, sortDir, statusFilter]);

  if (loading) {
    return (
      <main className="page-shell">
        <p className="page-kicker">Dashboard</p>
        <p style={{ color: "var(--muted)" }}>Loading live metrics…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page-shell">
        <h1>Dashboard</h1>
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
          <p className="page-kicker">Operations overview</p>
          <h1>Idea dashboard</h1>
          <p>
            Live view of every submission, split idea, handover, and GH site assignment.
            Filter the list below or jump into a queue.
          </p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={workerState?.ackEmailEnabled ?? false}
            disabled={ackToggleBusy || !workerState}
            onClick={() => void handleAckEmailToggle()}
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            Thank-you email{" "}
            <span className="switch-label">{workerState?.ackEmailEnabled ? "On" : "Off"}</span>
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => void handleReset()}
            disabled={resetBusy || Boolean(splitting)}
          >
            {resetBusy ? "Clearing…" : "Start over"}
          </button>
        </div>
      </div>

      {workerState?.lastError && (
        <div className="panel is-danger">
          <strong>Auto-split error:</strong> {workerState.lastError}
        </div>
      )}

      <div className="metric-grid">
        {(
          [
            ["all", "Submissions", metrics.all, `${metrics.people} people · ${metrics.today} today`, "is-slate"],
            ["pending", "Not split", metrics.pending, "Waiting in inbox", "is-blue"],
            ["split", "Split", metrics.split, `${metrics.ideas} idea cards`, "is-amber"],
            ["sent", "Fully sent", metrics.sent, "All ideas handed over", "is-green"],
          ] as const
        ).map(([id, label, count, hint, tone]) => (
          <button
            key={id}
            type="button"
            className={`metric-card ${tone}${statusFilter === id ? " is-active" : ""}`}
            onClick={() => setStatusFilter(id)}
          >
            <div className="label">{label}</div>
            <div className="value">{count}</div>
            <div className="hint">{hint}</div>
          </button>
        ))}
      </div>

      <div className="metric-grid">
        <Link className="metric-card is-slate" href="/split-overview">
          <div className="label">All split ideas</div>
          <div className="value">{metrics.ideas}</div>
          <div className="hint">Open overview table</div>
        </Link>
        <Link className="metric-card is-blue" href="/split-ideas">
          <div className="label">Awaiting send</div>
          <div className="value">{metrics.ideasAwaiting}</div>
          <div className="hint">Open Split ideas</div>
        </Link>
        <Link className="metric-card is-amber" href="/gh-site">
          <div className="label">GH site queue</div>
          <div className="value">{metrics.ghAssigned}</div>
          <div className="hint">{metrics.ghAwaiting} waiting · {metrics.ghSent} sent</div>
        </Link>
        <div className="metric-card is-green">
          <div className="label">Ideas sent</div>
          <div className="value">{metrics.ideasSent + metrics.ghSent}</div>
          <div className="hint">Handed over to teams</div>
        </div>
        <div className="metric-card">
          <div className="label">This week</div>
          <div className="value">{metrics.last7}</div>
          <div className="hint">New submissions in 7 days</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, PIN, email, or idea text"
          aria-label="Search submissions"
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
            <option value="status">Status</option>
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

      {visibleRows.length === 0 && (
        <div className="panel">
          <p className="panel-empty">
            {rows.length === 0
              ? "No submissions in the sheet yet."
              : needle
                ? `No ideas match “${query.trim()}”.`
                : "No submissions in this status."}
          </p>
        </div>
      )}

      {visibleRows.map((row) => {
        const status = boardStatus(row);
        const parsed = parseSplitResult(row.splitResultJson);
        const logs = logsByRow[row.rowNumber] ?? [];
        const ghCount = parsed?.ideas.filter(isGhSiteAssigned).length ?? 0;
        const sentCount = parsed?.ideas.filter((idea) => idea.sent).length ?? 0;
        return (
          <section key={row.rowNumber} className="panel">
            <div className="card-head">
              <div>
                <div className="card-title">{row.name || "Unknown submitter"}</div>
                <div className="card-meta">
                  PIN {row.pin || "—"} · {row.email || "No email"} · {row.timestamp || "No date"}
                </div>
              </div>
              <span className={badgeClass(status)}>
                {statusLabel(status)}
                {parsed ? ` · ${parsed.ideaCount} idea${parsed.ideaCount === 1 ? "" : "s"}` : ""}
              </span>
            </div>

            {parsed && (
              <div className="status-pills" style={{ marginBottom: 12 }}>
                <span className="status-pill">{sentCount} sent</span>
                <span className="status-pill">{Math.max(parsed.ideaCount - sentCount, 0)} awaiting send</span>
                {ghCount > 0 && <span className="status-pill">{ghCount} on GH site</span>}
              </div>
            )}

            <pre className="idea-excerpt">{row.rawIdeaText || "No idea text"}</pre>

            <div className="action-row">
              {status === "pending" && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleSplit(row)}
                  disabled={splitting === row.rowNumber}
                >
                  {splitting === row.rowNumber ? "Splitting…" : "Split"}
                </button>
              )}
              {status !== "pending" && (
                <Link href={`/split-ideas?row=${row.rowNumber}`}>
                  <button type="button" className="primary">Open split ideas</button>
                </Link>
              )}
              {ghCount > 0 && (
                <Link href={`/gh-site?row=${row.rowNumber}`}>
                  <button type="button">Open GH site</button>
                </Link>
              )}
            </div>

            {logs.length > 0 && (
              <div className="log-list">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      color:
                        log.tone === "done"
                          ? "var(--success)"
                          : log.tone === "error"
                            ? "var(--danger)"
                            : "var(--primary)",
                    }}
                  >
                    {log.tone === "done" ? `✓ ${log.message}` : log.tone === "error" ? `✕ ${log.message}` : `● ${log.message}`}
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
