const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function parseEmails(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const email = normalizeEmail(part);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export function formatEmails(emails: string[]): string {
  return parseEmails(emails.join(",")).join(", ");
}

export function invalidEmails(value: string | string[] | null | undefined): string[] {
  return parseEmails(value).filter((email) => !isValidEmail(email));
}
