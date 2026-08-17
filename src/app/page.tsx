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
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Inbox</h1>
      <p style={{ color: "#555", marginTop: 0, marginBottom: 16, fontSize: 14 }}>
        Unsplit submissions wait here. Turn Auto-split on in{" "}
        <Link href="/split-ideas">Split ideas</Link> to process them as they
        arrive; each split idea appears there in its own edit box.
      </p>

      {rows.length === 0 && <p>No pending submissions.</p>}

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
        </section>
      ))}
    </main>
  );
}
