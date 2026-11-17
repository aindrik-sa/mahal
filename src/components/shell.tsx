import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { NavLinks, type NavItem } from "./nav-links";

export function Shell({ title, user, items, children }: {
  title: string; user: { name: string; role: string }; items: NavItem[]; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="print:hidden md:w-60 md:shrink-0 md:border-r border-stone-200 bg-white md:min-h-screen md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 md:block">
          <Link href="/" className="block">
            <div className="text-lg font-bold text-emerald-800">Mahall</div>
            <div className="text-xs text-stone-500 truncate">{title}</div>
          </Link>
          <form action={logout} className="md:hidden"><button className="text-sm text-stone-600">Sign out</button></form>
        </div>
        <NavLinks items={items} />
        <div className="hidden md:block px-4 py-3 border-t border-stone-200 text-sm">
          <div className="font-medium truncate">{user.name}</div>
          <div className="text-xs text-stone-500 mb-2">{user.role === "RESIDENT" ? "Resident" : "Administrator"}</div>
          <form action={logout}><button className="text-stone-600 hover:text-stone-900">Sign out</button></form>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-4 py-5 sm:px-6 lg:px-8 max-w-6xl">{children}</main>
    </div>
  );
}
