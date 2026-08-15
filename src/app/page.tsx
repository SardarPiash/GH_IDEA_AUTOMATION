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

export default function ReviewPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<number | null>(null);
  const [justSplit, setJustSplit] = useState<string | null>(null);

  useEffect(() => {
    fetchRows();
  }, []);

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
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber: row.rowNumber, rawText: row.rawIdeaText }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setRows((prev) => prev.filter((r) => r.rowNumber !== row.rowNumber));
      const count = data.ideaCount ?? data.ideas?.length ?? 0;
      setJustSplit(
        `Split ${row.name}'s submission into ${count} idea${count === 1 ? "" : "s"} and saved it to the sheet.`
      );
    } catch (err: any) {
      alert(`Split failed: ${err.message}`);
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
        Unsplit submissions only. After Gemini succeeds, the row leaves this list and
        appears on the Split Ideas Dashboard.
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
          <button onClick={() => handleSplit(row)} disabled={splitting === row.rowNumber}>
            {splitting === row.rowNumber ? "Splitting…" : "Split into ideas"}
          </button>
        </section>
      ))}
    </main>
  );
}
