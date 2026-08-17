export const TEAM_EMAIL_OPTIONS = [
  { team: "Business Development", email: "adnan@rokomari.com" },
  { team: "Supply Chain", email: "jimy@rokomari.com" },
  { team: "Brand-marketing", email: "sadi@rokomari.com" },
  { team: "Product management", email: "rahat@rokomari.com" },
  { team: "GH site", email: "tuhinaranyo@gmail.com" },
  { team: "Piash", email: "sardarpiash8@gmail.com" },
] as const;

export type TeamEmailOption = (typeof TEAM_EMAIL_OPTIONS)[number];

export function teamLabelForEmail(email: string): string | undefined {
  const needle = email.trim().toLowerCase();
  return TEAM_EMAIL_OPTIONS.find((option) => option.email.toLowerCase() === needle)?.team;
}

export const GH_SITE_TEAM =
  TEAM_EMAIL_OPTIONS.find((option) => option.team === "GH site") ?? {
    team: "GH site",
    email: "tuhinaranyo@gmail.com",
  };

export function isGhSiteAssigned(idea: { assignedToGhSite?: boolean }): boolean {
  return Boolean(idea.assignedToGhSite);
}
