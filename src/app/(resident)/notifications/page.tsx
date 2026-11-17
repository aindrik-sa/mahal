import Link from "next/link";
import type { NotificationCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABEL, visibleWhere } from "@/lib/notify";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { PriorityBadge } from "@/components/notifications";
import { RefreshOnce } from "@/components/refresh-once";

const PAGE = 30;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ c?: string; page?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const c = sp.c && sp.c in CATEGORY_LABEL ? (sp.c as NotificationCategory) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const base = visibleWhere(user.id);
  const where = c ? { ...base, notification: { ...(base.notification as object), category: c } } : base;
  const [items, total] = await Promise.all([
    db.notificationRecipient.findMany({
      where, orderBy: { notification: { publishAt: "desc" } }, skip: (page - 1) * PAGE, take: PAGE,
      include: { notification: { include: { meeting: { select: { id: true } } } } },
    }),
    db.notificationRecipient.count({ where }),
  ]);
  // Opening the page marks what's shown as read; the highlight below uses the state before marking.
  const unreadIds = items.filter((i) => !i.readAt).map((i) => i.id);
  if (unreadIds.length) await db.notificationRecipient.updateMany({ where: { id: { in: unreadIds }, userId: user.id }, data: { readAt: new Date() } });

  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ ...(c && { c }), ...o })}`;
  return (
    <>
      <RefreshOnce when={unreadIds.length > 0} />
      <PageHeader title="Notifications" subtitle={`${total} message${total === 1 ? "" : "s"}`} />
      <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
        <Link href="?" className={`badge px-3 py-1 ${!c ? "bg-emerald-700 text-white" : "bg-stone-200 text-stone-700"}`}>All</Link>
        {(Object.keys(CATEGORY_LABEL) as NotificationCategory[]).map((k) => (
          <Link key={k} href={`?c=${k}`} className={`badge px-3 py-1 whitespace-nowrap ${c === k ? "bg-emerald-700 text-white" : "bg-stone-200 text-stone-700"}`}>{CATEGORY_LABEL[k]}</Link>
        ))}
      </div>
      {items.length === 0 ? <div className="card"><Empty>No notifications.</Empty></div> : (
        <div className="space-y-2">
          {items.map(({ id, readAt, notification: n }) => (
            <article key={id} className={`card ${!readAt ? "border-emerald-400 bg-emerald-50/40" : ""} ${n.priority === "URGENT" ? "border-red-400" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                {!readAt && <span className="w-2 h-2 rounded-full bg-emerald-600" aria-label="Unread" />}
                <h2 className="font-medium">{n.title}</h2>
                <PriorityBadge p={n.priority} />
                <span className="text-xs text-stone-500 ml-auto">{fmtDateTime(n.publishAt)}</span>
              </div>
              <p className="text-sm text-stone-700 mt-1 whitespace-pre-line">{n.body}</p>
              <div className="flex flex-wrap gap-3 mt-2 text-sm">
                <span className="text-xs text-stone-500">{CATEGORY_LABEL[n.category]}</span>
                {n.attachmentUrl && <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-800 hover:underline">Attachment</a>}
                {n.meeting && <Link href={`/meetings/${n.meeting.id}`} className="text-emerald-800 hover:underline">View meeting</Link>}
                {(n.category === "SUBSCRIPTION" || n.category === "PAYMENT") && <Link href="/subscriptions" className="text-emerald-800 hover:underline">Go to subscriptions</Link>}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        {page > 1 && <Link className="btn-outline" href={qs({ page: String(page - 1) })}>Newer</Link>}
        {page * PAGE < total && <Link className="btn-outline" href={qs({ page: String(page + 1) })}>Older</Link>}
      </div>
    </>
  );
}
