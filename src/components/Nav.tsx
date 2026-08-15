"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Idea Review & Routing" },
  { href: "/split-ideas", label: "Split Ideas Dashboard" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: "white",
        borderBottom: "1px solid #e2e2e5",
        padding: "12px 24px",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              textDecoration: "none",
              color: active ? "#111" : "#555",
              fontWeight: active ? 650 : 500,
              fontSize: 14,
              padding: "6px 10px",
              borderRadius: 6,
              background: active ? "#eef2ff" : "transparent",
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
