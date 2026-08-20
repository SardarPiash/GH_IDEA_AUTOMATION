"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseEmails } from "@/lib/emails";
import { isGhSiteAssigned, teamLabelForEmail } from "@/lib/teamEmails";
import { markdownToPlainText } from "@/lib/markdownHtml";
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

type IdeaStatus = "awaiting" | "sent" | "gh-site";
type StatusFilter = "all" | IdeaStatus;
type SortField = "timestamp" | "name" | "title" | "status" | "team";
type SortDir = "asc" | "desc";

type FlatIdea = {
  key: string;
  row: SubmissionRow;
  idea: StoredIdea;
  ideaIndex: number;
  splitCount: number;
  status: IdeaStatus;
  teamLabel: string;
};

function ideaStatus(row: SubmissionRow, idea: StoredIdea): IdeaStatus {
  if (isGhSiteAssigned(idea)) return "gh-site";
  if (idea.sent || row.status.trim().toLowerCase() === "sent") return "sent";
  return "awaiting";
}

function statusLabel(status: IdeaStatus) {
  if (status === "sent") return "Sent";
  if (status === "gh-site") return "GH site";
  return "Awaiting send";
}

function badgeClass(status: IdeaStatus) {
  if (status === "sent") return "badge badge-green";
  if (status === "gh-site") return "badge badge-amber";
  return "badge badge-blue";
}

function teamText(idea: StoredIdea): string {
  if (isGhSiteAssigned(idea)) return "GH site team";
  const emails = parseEmails(idea.teamEmail);
  if (emails.length === 0) return "—";
  return emails
    .map((email) => teamLabelForEmail(email) ?? email)
    .join(", ");
}

function summaryPreview(summary: string, title: string): string {
  const heading = title.trim();
  let text = markdownToPlainText(summary);
  if (heading) {
    const prefix = new RegExp(
      `^(idea proposal:\\s*)?${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
      "i"
    );
    text = text.replace(prefix, "").trim();
  }
  text = text.replace(/^idea proposal:\s*/i, "").trim();
  if (!text) return "No summary yet";
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function openDoc(rowNumber: number, ideaIndex: number) {
  window.open(
    `/doc?rowNumber=${rowNumber}&ideaIndex=${ideaIndex}`,
    "_blank",
    "noopener,noreferrer"
  );
}

export default function SplitOverviewPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchRows = useCallback(async () => {
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
    setRows(data.rows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const ideas = useMemo(() => {
    const items: FlatIdea[] = [];
    for (const row of rows) {
      const parsed = parseSplitResult(row.splitResultJson);
      if (!parsed) continue;
      parsed.ideas.forEach((idea, ideaIndex) => {
        const status = ideaStatus(row, idea);
        items.push({
          key: `${row.rowNumber}-${ideaIndex}`,
          row,
          idea,
          ideaIndex,
          splitCount: parsed.ideas.length,
          status,
          teamLabel: teamText(idea),
        });
      });
    }
    return items;
  }, [rows]);

  const metrics = useMemo(() => {
    const next = {
      total: ideas.length,
      awaiting: 0,
      sent: 0,
      ghSite: 0,
      submissions: rows.length,
      people: 0,
      withTeam: 0,
      cc: 0,
    };
    const people = new Set<string>();
    for (const item of ideas) {
      if (item.status === "awaiting") next.awaiting += 1;
      else if (item.status === "sent") next.sent += 1;
      else next.ghSite += 1;
      if (item.teamLabel !== "—") next.withTeam += 1;
      if (item.idea.ccSubmitter) next.cc += 1;
      const person = (item.row.email || item.row.pin || item.row.name).trim().toLowerCase();
      if (person) people.add(person);
    }
    next.people = people.size;
    return next;
  }, [ideas, rows.length]);

  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const filtered = ideas.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!needle) return true;
      const hay = [
        item.idea.title,
        item.idea.summary,
        item.idea.teamEmail,
        item.teamLabel,
        item.row.name,
        item.row.pin,
        item.row.email,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "timestamp") {
        cmp = (Date.parse(a.row.timestamp) || 0) - (Date.parse(b.row.timestamp) || 0);
      } else if (sortBy === "name") {
        cmp = (a.row.name || "").localeCompare(b.row.name || "", undefined, { sensitivity: "base" });
      } else if (sortBy === "title") {
        cmp = (a.idea.title || "").localeCompare(b.idea.title || "", undefined, { sensitivity: "base" });
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = a.teamLabel.localeCompare(b.teamLabel, undefined, { sensitivity: "base" });
      }
      if (cmp !== 0) return cmp * dir;
      if (a.row.rowNumber !== b.row.rowNumber) return (a.row.rowNumber - b.row.rowNumber) * dir;
      return a.ideaIndex - b.ideaIndex;
    });
  }, [ideas, needle, statusFilter, sortBy, sortDir]);

  if (loading) {
    return (
      <main className="page-shell is-wide">
        <p className="page-kicker">Overview</p>
        <p style={{ color: "var(--muted)" }}>Loading split ideas…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page-shell is-wide">
        <h1>Split ideas overview</h1>
        <div className="panel is-danger">
          <strong>Couldn’t load the sheet</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{loadError}</pre>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell is-wide">
      <div className="page-hero">
        <div>
          <p className="page-kicker">Overview</p>
          <h1>All split ideas</h1>
          <p>
            One row per split idea, with status, team, and a document button. Use this table to scan
            the whole pipeline without opening each submission.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        {(
          [
            ["all", "Split ideas", metrics.total, `${metrics.submissions} submissions · ${metrics.people} people`, "is-slate"],
            ["awaiting", "Awaiting send", metrics.awaiting, "Still in the review queue", "is-blue"],
            ["sent", "Sent", metrics.sent, "Handed over to a team", "is-green"],
            ["gh-site", "GH site", metrics.ghSite, "Assigned to GH site team", "is-amber"],
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
        <div className="metric-card">
          <div className="label">Team assigned</div>
          <div className="value">{metrics.withTeam}</div>
          <div className="hint">Has a destination team</div>
        </div>
        <div className="metric-card">
          <div className="label">CC submitter</div>
          <div className="value">{metrics.cc}</div>
          <div className="hint">Copy back to the author</div>
        </div>
        <Link className="metric-card is-blue" href="/split-ideas">
          <div className="label">Review queue</div>
          <div className="value">{metrics.awaiting}</div>
          <div className="hint">Open Split ideas</div>
        </Link>
        <Link className="metric-card is-amber" href="/gh-site">
          <div className="label">GH site queue</div>
          <div className="value">{metrics.ghSite}</div>
          <div className="hint">Open GH site team</div>
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, name, PIN, email, or team"
          aria-label="Search split ideas"
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
            <option value="title">Idea title</option>
            <option value="name">Submitter</option>
            <option value="status">Status</option>
            <option value="team">Team</option>
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

      <div className="panel overview-table-wrap">
        {visible.length === 0 ? (
          <p className="panel-empty">
            {ideas.length === 0
              ? "No split ideas yet."
              : needle
                ? `No ideas match “${query.trim()}”.`
                : "No ideas in this status."}
          </p>
        ) : (
          <table className="overview-table">
            <thead>
              <tr>
                <th>Submitter</th>
                <th>Date</th>
                <th>Status</th>
                <th>Team</th>
                <th>CC</th>
                <th>Split idea</th>
                <th>Document</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.key}>
                  <td>
                    <div className="overview-submitter">
                      <strong>{item.row.name || "Unknown"}</strong>
                      <span>
                        PIN {item.row.pin || "—"}
                        {item.row.email ? ` · ${item.row.email}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className="overview-nowrap">{item.row.timestamp || "—"}</td>
                  <td>
                    <div className="overview-status">
                      <span className={badgeClass(item.status)}>{statusLabel(item.status)}</span>
                      {item.status === "gh-site" && item.idea.sent && (
                        <span className="badge badge-green">Sent</span>
                      )}
                    </div>
                  </td>
                  <td>{item.teamLabel}</td>
                  <td>{item.idea.ccSubmitter ? "Yes" : "—"}</td>
                  <td>
                    <div className="overview-idea">
                      <span className="overview-idea-index">
                        Idea {item.ideaIndex + 1} of {item.splitCount}
                      </span>
                      <strong>{item.idea.title?.trim() || "Untitled idea"}</strong>
                      <span className="overview-idea-preview">
                        {summaryPreview(item.idea.summary ?? "", item.idea.title ?? "")}
                      </span>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => openDoc(item.row.rowNumber, item.ideaIndex)}
                    >
                      Open doc
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
