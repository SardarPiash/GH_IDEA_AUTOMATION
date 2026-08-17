"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { formatEmails, isValidEmail, parseEmails } from "@/lib/emails";

type LockedEmail = {
  email: string;
  label?: string;
};

type EmailChipsProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  lockedEmails?: LockedEmail[];
};

export default function EmailChips({
  value,
  onChange,
  onBlur,
  readOnly,
  placeholder = "Add team emails",
  lockedEmails = [],
}: EmailChipsProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emails = parseEmails(value);
  const locked = parseEmails(lockedEmails.map((item) => item.email).join(",")).filter(isValidEmail);
  const lockedSet = new Set(locked);
  const editable = emails.filter((email) => !lockedSet.has(email));

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
    onChange(formatEmails([...editable, ...parts].filter((email) => !lockedSet.has(email))));
    setDraft(nextDraft);
    setError(null);
    scheduleBlur();
    return true;
  }

  function remove(email: string) {
    if (readOnly || lockedSet.has(email)) return;
    onChange(formatEmails(editable.filter((item) => item !== email)));
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
    if (event.key === "Backspace" && !draft && editable.length) {
      event.preventDefault();
      remove(editable[editable.length - 1]);
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
    onBlur?.();
  }

  const shownLocked = lockedEmails.filter((item) => isValidEmail(item.email));
  const empty = editable.length === 0 && shownLocked.length === 0 && !draft;

  return (
    <div>
      <div
        className={`email-chips${readOnly ? " is-readonly" : ""}`}
        onClick={() => inputRef.current?.focus()}
      >
        {shownLocked.map((item) => (
          <span key={`locked-${item.email}`} className="email-chip is-locked" title="Always gets a copy">
            <span className="email-chip-text">{item.email}</span>
            <span className="email-chip-tag">{item.label || "copy"}</span>
          </span>
        ))}
        {editable.map((email) => (
          <span key={email} className="email-chip">
            <span className="email-chip-text">{email}</span>
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
        ))}
        {!readOnly && (
          <input
            ref={inputRef}
            className="email-chips-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
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
      {error ? (
        <div className="email-chips-hint is-error">{error}</div>
      ) : (
        <div className="email-chips-hint">
          Press Enter or comma to add more. One send goes to every address
          {shownLocked.length ? ", plus a copy to the submitter" : ""}.
        </div>
      )}
    </div>
  );
}
