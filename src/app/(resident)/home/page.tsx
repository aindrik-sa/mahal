import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Stat, ComingSoon } from "@/components/ui";
import { familyLedger, applyLateFees, rupees } from "@/lib/billing";
import { fmtDate } from "@/lib/format";

export default async function ResidentHome() {
  const user = await requireUser();
  const m = user.masjidId;
  const [families, members, board] = await Promise.all([
    db.family.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.member.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.boardMember.findMany({ where: { masjidId: m, status: "ACTIVE" }, orderBy: { sortOrder: "asc" }, take: 4, select: { id: true, fullName: true, designation: true } }),
  ]);
  const familyId = user.memberId ? (await db.member.findUnique({ where: { id: user.memberId }, select: { familyId: true } }))?.familyId : null;
  if (familyId) await applyLateFees(m);
  const ledger = familyId ? await familyLedger(m, familyId) : null;
  const s = ledger?.rows.length ? ledger.summary : null;
  return (
    <>
      <PageHeader title={`Assalamu alaikum, ${user.name.split(" ")[0]}`} subtitle="Your Mahall at a glance" />
      {s && (
        <Link href="/subscriptions" className={`card block mb-4 hover:opacity-90 ${s.overdueCount ? "border-red-300 bg-red-50" : ""}`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div><div className="text-xs font-medium uppercase tracking-wide text-stone-500">Subscription due now</div><div className="text-2xl font-semibold">{rupees(s.dueNow)}</div></div>
            <div className="text-sm text-stone-600">
              {s.overdueCount ? <span className="text-red-700 font-medium">{s.overdueCount} overdue installment{s.overdueCount > 1 ? "s" : ""}. </span> : null}
              {s.nextDue ? <>Next: {rupees(s.nextDue.amount)} on {fmtDate(s.nextDue.date)}. </> : <>All installments paid. </>}
              Paid {rupees(s.paid)} of {rupees(s.annual)} this year.
              {s.awaiting > 0 && <> {rupees(s.awaiting)} awaiting verification.</>}
            </div>
            <span className="btn ml-auto">{s.dueNow > 0 ? "Pay now" : "View"}</span>
          </div>
        </Link>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Stat label="Families" value={families} href="/mahall" />
        <Stat label="Registered members" value={members} href="/mahall" />
        <Stat label="Board members" value={board.length ? `${board.length}+` : 0} href="/board" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold">General board</h2>
            <Link href="/board" className="text-sm text-emerald-800 hover:underline">View all</Link>
          </div>
          <ul className="text-sm divide-y divide-stone-100">
            {board.map((b) => <li key={b.id} className="py-2 flex justify-between"><span>{b.fullName}</span><span className="text-stone-500">{b.designation}</span></li>)}
          </ul>
        </section>
        <div className="grid gap-3">
          <ComingSoon title="Notifications, announcements & upcoming meetings" phase={3} />
          <ComingSoon title="Certificate applications" phase={4} />
          <ComingSoon title="Income & expense summary" phase={5} />
        </div>
      </div>
    </>
  );
}
