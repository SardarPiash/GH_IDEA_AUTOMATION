"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SubmissionRow = {
  rowNumber: number;
  timestamp: string;
  name: string;
  pin: string;
  rawIdeaText: string;
};

type SplitLog = { message: string; tone: "running" | "done" | "error" };

export default function ReviewPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<number | null>(null);
  const [justSplit, setJustSplit] = useState<string | null>(null);
  const [logsByRow, setLogsByRow] = useState<Record<number, SplitLog[]>>({});
  const [finishedRows, setFinishedRows] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchRows();
  }, []);

  function appendLog(rowNumber: number, message: string, tone: SplitLog["tone"] = "running") {
    setLogsByRow((prev) => ({
      ...prev,
      [rowNumber]: [...(prev[rowNumber] ?? []), { message, tone }],
    }));
  }

  async function fetchRows() {
    setLoading(true);
    setLoadError(null);
    const res = await fetch("/api/ideas?status=pending");
    const data = await res.json();
    if (data.error) {
      setLoadError(data.error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(data.rows ?? []);
    setLoading(false);
  }

  async function handleSplit(row: SubmissionRow) {
    setSplitting(row.rowNumber);
    setLogsByRow((prev) => ({ ...prev, [row.rowNumber]: [{ message: "Starting…", tone: "running" }] }));
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
      let finishedMessage: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      if (buffer.trim()) processLine(buffer);

      function processLine(line: string) {
        if (!line.trim()) return;
        const event = JSON.parse(line) as {
          type: string;
          message?: string;
          ideaCount?: number;
          source?: string;
        };
        if (event.type === "error") {
          throw new Error(event.message || "Split failed");
        }
        if (event.type === "done") {
          finishedMessage =
            event.message ||
            `Finished (${event.source}) — ${event.ideaCount} idea${event.ideaCount === 1 ? "" : "s"} saved.`;
          appendLog(row.rowNumber, finishedMessage, "done");
        } else if (event.message) {
          appendLog(row.rowNumber, event.message, "running");
        }
      }

      if (finishedMessage) {
        setFinishedRows((prev) => ({ ...prev, [row.rowNumber]: true }));
        setJustSplit(finishedMessage);
      } else {
        throw new Error("Split ended without a finished response");
      }
    } catch (err: any) {
      appendLog(row.rowNumber, `Failed: ${err.message}`, "error");
    } finally {
      setSplitting(null);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading submissions…</div>;

  if (loadError) {
    return (
      <div style={{ padding: 24, maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>Idea Review & Routing</h1>
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
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Idea Review & Routing</h1>
      <p style={{ color: "#555", marginTop: 0, marginBottom: 16, fontSize: 14 }}>
        Unsplit submissions only. After a successful split, the row leaves this
        list and appears on the Split Ideas Dashboard as a proposal document.
      </p>

      {justSplit && (
        <div
          style={{
            background: "#e8f6ec",
            border: "1px solid #b7e0c2",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            color: "#14532d",
            fontSize: 14,
          }}
        >
          {justSplit}{" "}
          <Link href="/split-ideas" style={{ fontWeight: 650, color: "#14532d" }}>
            Open dashboard →
          </Link>
        </div>
      )}

      {rows.length === 0 && <p>No pending submissions. Split ideas appear on the dashboard.</p>}

      {rows.map((row) => (
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
            {row.name} · PIN {row.pin} · {row.timestamp}
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14 }}>
            {row.rawIdeaText}
          </pre>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <button
              onClick={() => handleSplit(row)}
              disabled={splitting === row.rowNumber || finishedRows[row.rowNumber]}
            >
              {splitting === row.rowNumber
                ? "Splitting…"
                : finishedRows[row.rowNumber]
                  ? "Split finished"
                  : "Split into ideas"}
            </button>
            <div style={{ fontSize: 12, lineHeight: 1.45, minWidth: 220, flex: 1 }}>
              {(logsByRow[row.rowNumber] ?? []).map((log, i) => (
                <div
                  key={i}
                  style={{
                    color:
                      log.tone === "done" ? "#14532d" : log.tone === "error" ? "#9a3412" : "#1d4ed8",
                  }}
                >
                  {log.tone === "running" && splitting === row.rowNumber && i === (logsByRow[row.rowNumber]?.length ?? 1) - 1
                    ? `● ${log.message}`
                    : log.tone === "done"
                      ? `✓ ${log.message}`
                      : log.tone === "error"
                        ? `✕ ${log.message}`
                        : log.message}
                </div>
              ))}
              {finishedRows[row.rowNumber] && (
                <Link href="/split-ideas" style={{ fontWeight: 650, color: "#14532d" }}>
                  Open dashboard →
                </Link>
              )}
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}
