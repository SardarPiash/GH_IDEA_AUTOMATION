"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/split-ideas", label: "Split ideas" },
  { href: "/split-overview", label: "Overview" },
  { href: "/gh-site", label: "GH site team" },
  { href: "/resend-sent", label: "Resend sent" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === "/doc") return null;

  return (
    <header className="app-header">
      <Link href="/" className="app-brand">
        <span className="app-brand-mark" aria-hidden="true">
          GH
        </span>
        Idea Router
      </Link>
      <nav className="app-nav" aria-label="Main">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`app-nav-link${active ? " active" : ""}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
