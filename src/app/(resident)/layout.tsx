import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";
import { unreadCount } from "@/lib/notify";

const items = [
  { href: "/home", label: "Home" },
  { href: "/mahall", label: "Mahall" },
  { href: "/board", label: "Board Members" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/notifications", label: "Notifications" },
  { href: "/applications", label: "Applications" },
  { href: "/finance", label: "Finance" },
  { href: "/meetings", label: "Agendas & Meetings" },
  { href: "/profile", label: "My Profile" },
];

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [masjid, unread] = await Promise.all([db.masjid.findUniqueOrThrow({ where: { id: user.masjidId } }), unreadCount(user.id)]);
  const nav = items.map((i) => (i.href === "/notifications" ? { ...i, badge: unread } : i));
  return <Shell title={masjid.name} user={user} items={nav}>{children}</Shell>;
}
