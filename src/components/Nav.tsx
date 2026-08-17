"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Showboard" },
  { href: "/split-ideas", label: "Split ideas" },
  { href: "/gh-site", label: "GH site team" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === "/doc") return null;

  return (
    <header className="app-header">
      <Link href="/" className="app-brand">
        Idea Router
      </Link>
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
    </header>
  );
}
