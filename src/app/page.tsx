"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseSplitResult } from "@/lib/split";

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

function statusStyle(status: BoardStatus): React.CSSProperties {
  if (status === "sent") {
    return { background: "var(--success-bg)", color: "var(--success)" };
  }
  if (status === "split") {
    return { background: "#fef3c7", color: "#92400e" };
  }
  return { background: "var(--accent-bg)", color: "var(--primary)" };
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

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (splitting) return;
      void fetchRows(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchRows, splitting]);

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

  const counts = useMemo(() => {
    const next = { all: rows.length, pending: 0, split: 0, sent: 0 };
    for (const row of rows) {
      next[boardStatus(row)] += 1;
    }
    return next;
  }, [rows]);

  const needle = query.trim().toLowerCase();

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      const status = boardStatus(row);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!needle) return true;
      const hay = `${row.name} ${row.pin} ${row.email}`.toLowerCase();
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
      <main style={pageStyle}>
        <p style={{ color: "var(--muted)" }}>Loading showboard…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Showboard</h1>
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
        <h1 style={{ fontSize: 24, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Showboard</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 14, maxWidth: 640 }}>
          Every original submission, not the split cards. Use this to see what is waiting,
          already split, or sent.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {(
          [
            ["all", "All", counts.all],
            ["pending", "Not split", counts.pending],
            ["split", "Split", counts.split],
            ["sent", "Sent", counts.sent],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatusFilter(id)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              background: statusFilter === id ? "var(--accent-bg)" : "var(--card)",
              borderColor: statusFilter === id ? "#bfdbfe" : "var(--border)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{count}</div>
          </button>
        ))}
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
        <div style={cardStyle}>
          <p style={{ margin: 0, color: "var(--muted)" }}>
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
        return (
          <section key={row.rowNumber} style={cardStyle}>
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
                  ...statusStyle(status),
                }}
              >
                {statusLabel(status)}
                {parsed ? ` · ${parsed.ideaCount} idea${parsed.ideaCount === 1 ? "" : "s"}` : ""}
              </span>
            </div>

            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: 14,
                margin: "0 0 14px",
                lineHeight: 1.5,
              }}
            >
              {row.rawIdeaText || "No idea text"}
            </pre>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
                <Link href="/split-ideas">
                  <button type="button">Open split ideas</button>
                </Link>
              )}
            </div>

            {logs.length > 0 && (
              <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 10 }}>
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
