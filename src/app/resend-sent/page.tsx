"use client";

import { useEffect, useState } from "react";
import { isValidEmail } from "@/lib/emails";

type SentPreview = {
  rowNumber: number;
  ideaIndex: number;
  title: string;
  name: string;
  teamEmail: string;
};

type LogLine = { ok: boolean; text: string };

export default function ResendSentPage() {
  const [to, setTo] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<SentPreview[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/resend-sent");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load sent ideas");
        if (cancelled) return;
        setCount(data.count ?? 0);
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend() {
    const email = to.trim();
    if (!isValidEmail(email)) {
      alert("Enter a valid email address.");
      return;
    }
    if (!count) {
      alert("There are no already-sent idea emails to copy.");
      return;
    }
    if (
      !confirm(
        `Send ${count} already-sent idea email${count === 1 ? "" : "s"} one by one to ${email}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setLog([]);
    setStatus("Starting…");
    try {
      const res = await fetch("/api/resend-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || "Request failed");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            total?: number;
            index?: number;
            title?: string;
            ok?: boolean;
            error?: string;
            message?: string;
            sent?: number;
            failed?: number;
          };
          if (event.type === "start") {
            setStatus(`Sending 0 of ${event.total}…`);
          } else if (event.type === "progress") {
            setStatus(`Sending ${event.index} of ${event.total}…`);
            setLog((prev) => [
              ...prev,
              {
                ok: Boolean(event.ok),
                text: event.ok
                  ? `${event.index}/${event.total} sent: ${event.title}`
                  : `${event.index}/${event.total} failed: ${event.title} — ${event.error}`,
              },
            ]);
          } else if (event.type === "done") {
            setStatus(
              `Finished. ${event.sent} sent${event.failed ? `, ${event.failed} failed` : ""}.`
            );
          } else if (event.type === "error") {
            throw new Error(event.message || "Resend failed");
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message);
      setLog((prev) => [...prev, { ok: false, text: message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-hero">
        <div>
          <p className="page-kicker">Copies</p>
          <h1>Resend sent emails</h1>
          <p>
            Sends every already-sent idea email again — same body and PDF — one by one to
            the address below.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="panel is-danger">
          <strong>Could not load sent ideas:</strong> {loadError}
        </div>
      )}

      <div className="panel">
        <p className="resend-count">
          {count == null ? "Counting sent emails…" : `${count} already-sent idea email${count === 1 ? "" : "s"} ready to copy.`}
        </p>
        <div className="resend-form">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Enter email address"
            aria-label="Destination email"
            disabled={busy}
          />
          <button
            type="button"
            className="primary"
            onClick={() => void handleSend()}
            disabled={busy || !count}
          >
            {busy ? "Sending…" : "Send all sent emails"}
          </button>
        </div>
        {status && <p className="resend-status">{status}</p>}
        {log.length > 0 && (
          <ul className="resend-log">
            {log.map((line, i) => (
              <li key={`${i}-${line.text}`} className={line.ok ? "is-ok" : "is-fail"}>
                {line.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="panel">
          <p className="resend-count">Will send these, one after another:</p>
          <ul className="resend-preview">
            {items.map((item) => (
              <li key={`${item.rowNumber}-${item.ideaIndex}`}>
                <strong>{item.title}</strong>
                <span>
                  {item.name}
                  {item.teamEmail ? ` · originally to ${item.teamEmail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
