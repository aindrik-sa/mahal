import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";

const items = [
  { href: "/home", label: "Home" },
  { href: "/mahall", label: "Mahall" },
  { href: "/board", label: "Board Members" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/notifications", label: "Notifications", soon: true },
  { href: "/applications", label: "Applications", soon: true },
  { href: "/finance", label: "Finance", soon: true },
  { href: "/meetings", label: "Agendas & Meetings", soon: true },
  { href: "/profile", label: "My Profile" },
];

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const masjid = await db.masjid.findUniqueOrThrow({ where: { id: user.masjidId } });
  return <Shell title={masjid.name} user={user} items={items}>{children}</Shell>;
}
