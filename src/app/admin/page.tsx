import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rupees, METHOD_LABEL } from "@/lib/billing";
import { planCollection } from "@/lib/collection";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { runSubscriptionReminders } from "@/lib/notify";
import { financeSummary, balanceAt, istYM, istDay } from "@/lib/finance";
import { PageHeader, Stat } from "@/components/ui";
import { PaymentBadge } from "@/components/billing";

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const m = user.masjidId;
  // Automated reminders piggyback on dashboard visits (the cron endpoint covers days nobody logs in).
  await runSubscriptionReminders(m).catch((e) => console.error("reminders failed", e));
  const [families, members, board, portalUsers, recent, plan, awaitingCount, recentPayments, meetings, openApps] = await Promise.all([
    db.family.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.member.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.boardMember.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.user.count({ where: { masjidId: m, role: "RESIDENT", isActive: true, passwordHash: { not: null } } }),
    db.auditLog.findMany({ where: { masjidId: m }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
    db.subscriptionPlan.findFirst({ where: { masjidId: m, isActive: true }, orderBy: { startMonth: "desc" } }),
    db.payment.count({ where: { masjidId: m, status: "PENDING_VERIFICATION" } }),
    db.payment.findMany({ where: { masjidId: m }, orderBy: { createdAt: "desc" }, take: 6, include: { family: { select: { familyName: true } } } }),
    db.meeting.findMany({ where: { masjidId: m, status: { in: ["DRAFT", "PUBLISHED"] }, startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 3 }),
    db.application.groupBy({ by: ["status"], where: { masjidId: m, status: { in: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED", "APPROVED"] } }, _count: true }),
  ]);
  const appCount = (s: string) => openApps.find((x) => x.status === s)?._count ?? 0;
  const { y: cy, m: cm } = istYM(new Date());
  const monthStart = istDay(`${cy}-${String(cm + 1).padStart(2, "0")}-01`);
  const [fin, balance] = await Promise.all([
    financeSummary(m, { from: monthStart, to: new Date(Date.now() + 864e5) }),
    balanceAt(m, new Date(Date.now() + 864e5)),
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
          <section className="card">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">Upcoming meetings</h2>
              <Link href="/admin/meetings" className="text-sm text-emerald-800 hover:underline">Manage</Link>
            </div>
            {meetings.length === 0 ? <p className="text-sm text-stone-500">None scheduled.</p> : (
              <ul className="text-sm space-y-2">
                {meetings.map((x) => (
                  <li key={x.id}><Link href={`/admin/meetings/${x.id}`} className="font-medium hover:underline">{x.title}</Link>
                    {x.status === "DRAFT" && <span className="badge bg-stone-200 text-stone-700 ml-1">Draft</span>}
                    <div className="text-xs text-stone-500">{fmtDateTime(x.startsAt)} · {x.location}</div></li>
                ))}
              </ul>
            )}
          </section>
          <Link href="/admin/applications" className="card block hover:border-emerald-400">
            <h2 className="font-semibold mb-1">Certificate applications</h2>
            <div className="text-sm text-stone-600 space-y-0.5">
              <div><b className="text-stone-900">{appCount("SUBMITTED")}</b> new · <b className="text-stone-900">{appCount("UNDER_REVIEW")}</b> under review</div>
              <div><b className="text-stone-900">{appCount("INFO_REQUIRED")}</b> waiting on applicant · <b className="text-stone-900">{appCount("APPROVED")}</b> to issue</div>
            </div>
          </Link>
          <Link href="/admin/finance" className="card block hover:border-emerald-400">
            <h2 className="font-semibold mb-1">Finance this month</h2>
            <div className="text-sm text-stone-600 space-y-0.5">
              <div className="flex justify-between"><span>Income</span><b className="text-stone-900 tabular-nums">{rupees(fin.totalIncome)}</b></div>
              <div className="flex justify-between"><span>Expenses</span><b className="text-stone-900 tabular-nums">{rupees(fin.totalExpense)}</b></div>
              <div className="flex justify-between border-t border-stone-100 pt-1"><span>Current balance</span><b className="text-stone-900 tabular-nums">{rupees(balance)}</b></div>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
