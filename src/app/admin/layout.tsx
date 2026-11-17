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
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/applications", label: "Applications", soon: true },
  { href: "/admin/meetings", label: "Meetings & Agendas" },
  { href: "/admin/finance", label: "Income & Expenses", soon: true },
  { href: "/admin/activity", label: "Activity Logs" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const [masjid, toVerify] = await Promise.all([
    db.masjid.findUniqueOrThrow({ where: { id: user.masjidId } }),
    db.payment.count({ where: { masjidId: user.masjidId, status: "PENDING_VERIFICATION" } }),
  ]);
  const nav = items.map((i) => (i.href === "/admin/payments" ? { ...i, badge: toVerify } : i));
  return <Shell title={masjid.name} user={user} items={nav}>{children}</Shell>;
}
