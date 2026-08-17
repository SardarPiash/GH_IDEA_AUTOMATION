"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { formatEmails, isValidEmail, parseEmails } from "@/lib/emails";
import { TEAM_EMAIL_OPTIONS, teamLabelForEmail } from "@/lib/teamEmails";

type EmailChipsProps = {
  value: string;
  onChange: (value: string) => void;
  onTyping?: () => void;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
};

export default function EmailChips({
  value,
  onChange,
  onTyping,
  onBlur,
  readOnly,
  placeholder = "Add team emails",
}: EmailChipsProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emails = parseEmails(value);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 2400);
    return () => clearTimeout(timer);
  }, [error]);

  function scheduleBlur() {
    window.setTimeout(() => onBlur?.(), 0);
  }

  function commit(raw: string, nextDraft = "") {
    const parts = parseEmails(raw);
    if (!parts.length) {
      setDraft(nextDraft);
      return false;
    }
    const invalid = parts.filter((email) => !isValidEmail(email));
    if (invalid.length) {
      setError(`Not a valid email: ${invalid[0]}`);
      return false;
    }
    onChange(formatEmails([...emails, ...parts]));
    setDraft(nextDraft);
    setError(null);
    scheduleBlur();
    return true;
  }

  function remove(email: string) {
    if (readOnly) return;
    onChange(formatEmails(emails.filter((item) => item !== email)));
    scheduleBlur();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (readOnly) return;
    if (["Enter", "Tab", ",", ";", " "].includes(event.key)) {
      if (!draft.trim()) return;
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && !draft && emails.length) {
      event.preventDefault();
      remove(emails[emails.length - 1]);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (readOnly) return;
    const text = event.clipboardData.getData("text");
    if (!/[,;\s]/.test(text)) return;
    event.preventDefault();
    commit(`${draft} ${text}`);
  }

  function handleBlur() {
    if (draft.trim()) commit(draft);
    else onBlur?.();
  }

  const empty = emails.length === 0 && !draft;
  const selected = new Set(emails);

  return (
    <div>
      <div className="email-picker">
        <select
          className="email-team-select"
          value=""
          disabled={readOnly}
          aria-label="Select a team email"
          onChange={(event) => {
            const email = event.target.value;
            if (email) commit(email);
          }}
        >
          <option value="">Select a team</option>
          {TEAM_EMAIL_OPTIONS.map((option) => (
            <option
              key={option.email}
              value={option.email}
              disabled={selected.has(option.email.toLowerCase())}
            >
              {option.team} — {option.email}
            </option>
          ))}
        </select>
        <div
          className={`email-chips${readOnly ? " is-readonly" : ""}`}
          onClick={() => inputRef.current?.focus()}
        >
          {emails.map((email) => {
            const team = teamLabelForEmail(email);
            return (
              <span key={email} className="email-chip" title={email}>
                <span className="email-chip-text">
                  {team ? `${team} · ${email}` : email}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="email-chip-remove"
                    aria-label={`Remove ${email}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(email);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
          {!readOnly && (
            <input
              ref={inputRef}
              className="email-chips-input"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                onTyping?.();
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={handleBlur}
              placeholder={empty ? placeholder : "Add another"}
              inputMode="email"
              autoComplete="off"
              aria-label="Team email addresses"
            />
          )}
          {readOnly && empty && (
            <span className="email-chips-empty">No team emails</span>
          )}
        </div>
      </div>
      {error ? (
        <div className="email-chips-hint is-error">{error}</div>
      ) : (
        <div className="email-chips-hint">
          Pick a team from the list, or type another email. One send goes to every address.
        </div>
      )}
    </div>
  );
}
