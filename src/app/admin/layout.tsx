import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";

const items = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/families", label: "Residential Management" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/board", label: "Board Management" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/notifications", label: "Notifications", soon: true },
  { href: "/admin/applications", label: "Applications", soon: true },
  { href: "/admin/meetings", label: "Meetings & Agendas", soon: true },
  { href: "/admin/finance", label: "Income & Expenses", soon: true },
  { href: "/admin/activity", label: "Activity Logs" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const masjid = await db.masjid.findUniqueOrThrow({ where: { id: user.masjidId } });
  return <Shell title={masjid.name} user={user} items={items}>{children}</Shell>;
}
