import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/notify";
import { PageHeader, Empty } from "@/components/ui";
import { PriorityBadge } from "@/components/notifications";
import { Compose } from "./compose";
import { withdrawNotification } from "./actions";
import { ConfirmButton } from "@/components/action-form";

const PAGE = 30;

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string; auto?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const showAuto = sp.auto === "1";
  const where = { masjidId: user.masjidId, ...(showAuto ? {} : { automated: false }) };
  const [wards, list, total] = await Promise.all([
    db.family.findMany({ where: { masjidId: user.masjidId, ward: { not: null } }, distinct: ["ward"], select: { ward: true }, orderBy: { ward: "asc" } }),
    db.notification.findMany({
      where, orderBy: { publishAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      include: { createdBy: { select: { name: true } }, _count: { select: { recipients: true } } },
    }),
    db.notification.count({ where }),
  ]);
  const readCounts = await db.notificationRecipient.groupBy({ by: ["notificationId"], where: { notificationId: { in: list.map((n) => n.id) }, readAt: { not: null } }, _count: true });
  const read = new Map(readCounts.map((r) => [r.notificationId, r._count]));
  const now = new Date();

  return (
    <>
      <PageHeader title="Notifications" subtitle="Announcements and notices to residents." />
      <section className="mb-8">
        <h2 className="font-semibold mb-2">New notification</h2>
        <Compose wards={wards.map((w) => w.ward!)} />
      </section>
      <section>
        <div className="flex justify-between items-end mb-2">
          <h2 className="font-semibold">History</h2>
          <Link href={showAuto ? "?" : "?auto=1"} className="text-sm text-emerald-800 hover:underline">{showAuto ? "Hide automated reminders" : "Show automated reminders"}</Link>
        </div>
        {list.length === 0 ? <div className="card"><Empty>Nothing sent yet.</Empty></div> : (
          <div className="space-y-2">
            {list.map((n) => {
              const scheduled = n.publishAt > now;
              const expired = n.expiresAt && n.expiresAt <= now;
              return (
                <div key={n.id} className="card text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{n.title}</span>
                    <PriorityBadge p={n.priority} />
                    <span className="badge bg-stone-100 text-stone-700">{CATEGORY_LABEL[n.category]}</span>
                    {scheduled && <span className="badge bg-sky-100 text-sky-800">Scheduled</span>}
                    {expired && <span className="badge bg-stone-200 text-stone-500">Expired</span>}
                    {n.automated && <span className="badge bg-stone-100 text-stone-500">Automated</span>}
                  </div>
                  <p className="text-stone-700 mt-1 whitespace-pre-line line-clamp-3">{n.body}</p>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-stone-500 mt-2">
                    <span>{n.publishAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                    <span>To: {n.audienceLabel ?? n.audience}</span>
                    <span>Read by {read.get(n.id) ?? 0} of {n._count.recipients}</span>
                    {n.createdBy && <span>By {n.createdBy.name}</span>}
                    {!expired && !n.automated && (
                      <form action={withdrawNotification} className="ml-auto">
                        <input type="hidden" name="id" value={n.id} />
                        <ConfirmButton className="text-red-700 hover:underline" message="Withdraw this notification? Residents will no longer see it.">Withdraw</ConfirmButton>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          {page > 1 && <Link className="btn-outline" href={`?${new URLSearchParams({ ...(showAuto && { auto: "1" }), page: String(page - 1) })}`}>Newer</Link>}
          {page * PAGE < total && <Link className="btn-outline" href={`?${new URLSearchParams({ ...(showAuto && { auto: "1" }), page: String(page + 1) })}`}>Older</Link>}
        </div>
      </section>
    </>
  );
}
