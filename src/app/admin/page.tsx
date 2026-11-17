import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rupees, METHOD_LABEL } from "@/lib/billing";
import { planCollection } from "@/lib/collection";
import { fmtDate } from "@/lib/format";
import { PageHeader, Stat, ComingSoon } from "@/components/ui";
import { PaymentBadge } from "@/components/billing";

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const m = user.masjidId;
  const [families, members, board, portalUsers, recent, plan, awaitingCount, recentPayments] = await Promise.all([
    db.family.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.member.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.boardMember.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.user.count({ where: { masjidId: m, role: "RESIDENT", isActive: true, passwordHash: { not: null } } }),
    db.auditLog.findMany({ where: { masjidId: m }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
    db.subscriptionPlan.findFirst({ where: { masjidId: m, isActive: true }, orderBy: { startMonth: "desc" } }),
    db.payment.count({ where: { masjidId: m, status: "PENDING_VERIFICATION" } }),
    db.payment.findMany({ where: { masjidId: m }, orderBy: { createdAt: "desc" }, take: 6, include: { family: { select: { familyName: true } } } }),
  ]);
  const col = plan ? (await planCollection(m, plan.id)).totals : null;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Assalamu alaikum, ${user.name}`}
        actions={<Link href="/admin/families/new" className="btn">Add family</Link>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat label="Families" value={families} href="/admin/families" />
        <Stat label="Registered residents" value={members} href="/admin/members" />
        <Stat label="Active board members" value={board} href="/admin/board" />
        <Stat label="Portal accounts" value={portalUsers} hint="Residents who activated login" />
      </div>
      {col && plan ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Stat label={`Collected · ${plan.name}`} value={rupees(col.paid)} hint={`of ${rupees(col.due)} billed`} href={`/admin/subscriptions/${plan.id}`} />
          <Stat label="Pending collection" value={rupees(col.owedNow)} hint="Installments already due" href={`/admin/subscriptions/${plan.id}?f=pending`} />
          <Stat label="Families overdue" value={col.overdueFamilies} href={`/admin/subscriptions/${plan.id}?f=overdue`} />
          <Stat label="Payments to verify" value={awaitingCount} hint={col.awaiting ? rupees(col.awaiting) : undefined} href="/admin/payments" />
        </div>
      ) : (
        <div className="card mb-6 text-sm flex flex-wrap justify-between items-center gap-2">
          <span>No active subscription plan yet.</span>
          <Link href="/admin/subscriptions" className="btn">Set up subscription</Link>
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="card">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">Recent payments</h2>
              <Link href="/admin/payments" className="text-sm text-emerald-800 hover:underline">View all</Link>
            </div>
            <ul className="divide-y divide-stone-100 text-sm">
              {recentPayments.length === 0 && <li className="py-2 text-stone-500">No payments yet.</li>}
              {recentPayments.map((p) => (
                <li key={p.id} className="py-2 flex flex-wrap items-center gap-x-3">
                  <span className="font-medium">{rupees(p.amount)}</span>
                  <span>{p.family.familyName}</span>
                  <span className="text-stone-500">{METHOD_LABEL[p.method]} · {fmtDate(p.paidOn)}</span>
                  <span className="ml-auto"><PaymentBadge s={p.status} /></span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">Recent administrative activity</h2>
              <Link href="/admin/activity" className="text-sm text-emerald-800 hover:underline">View all</Link>
            </div>
            <ul className="divide-y divide-stone-100 text-sm">
              {recent.length === 0 && <li className="py-2 text-stone-500">No activity yet.</li>}
              {recent.map((l) => (
                <li key={l.id} className="py-2 flex justify-between gap-3">
                  <span>{l.summary}</span>
                  <span className="text-xs text-stone-500 whitespace-nowrap">{l.user?.name} · {l.createdAt.toLocaleDateString("en-IN")}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="space-y-3">
          <ComingSoon title="Upcoming meetings" phase={3} />
          <ComingSoon title="Pending certificate applications" phase={4} />
          <ComingSoon title="Monthly income, expenses & balance" phase={5} />
        </div>
      </div>
    </>
  );
}
