"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; soon?: boolean; exact?: boolean };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto px-2 py-2 md:py-3 border-b md:border-0 border-stone-200">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        if (it.soon)
          return (
            <span key={it.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-stone-400 flex justify-between gap-2">
              {it.label}<span className="text-[10px] uppercase tracking-wide">soon</span>
            </span>
          );
        return (
          <Link key={it.href} href={it.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-emerald-50 text-emerald-800 font-medium" : "text-stone-700 hover:bg-stone-100"}`}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
