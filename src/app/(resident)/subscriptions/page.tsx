import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { familyLedger, applyLateFees, rupees, monthLabel } from "@/lib/billing";
import { fmtDate, toDateInput } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { InvoiceBadge, SummaryCards, PaymentHistory } from "@/components/billing";
import { PayForm } from "./pay-form";

export default async function ResidentSubscriptionsPage() {
  const user = await requireUser();
  const member = user.memberId ? await db.member.findFirst({ where: { id: user.memberId, masjidId: user.masjidId }, include: { family: true } }) : null;
  if (!member) return <><PageHeader title="Subscriptions" /><div className="card text-sm">Your account isn&apos;t linked to a family.</div></>;
  const fam = member.family;
  await applyLateFees(user.masjidId);
  const { plan, rows, payments, summary } = await familyLedger(user.masjidId, fam.id);

  if (!rows.length)
    return (
      <>
        <PageHeader title="Subscriptions" subtitle={`${fam.familyName} · ${fam.familyCode}`} />
        <div className="card"><Empty>{fam.subscriptionExempt ? "Your family is exempt from the masjid subscription." : "No subscription installments yet."}</Empty></div>
      </>
    );

  const now = new Date();
  const open = rows
    .filter((r) => r.owed - r.pendingAllocated > 0 && r.pendingAllocated === 0)
    .map((r) => ({ id: r.id, label: monthLabel(r.periodMonth), owed: r.owed, overdue: r.display === "OVERDUE", due: r.dueDate <= now }));

  return (
    <>
      <PageHeader title="Subscriptions"
        subtitle={`${fam.familyName} · ${fam.familyCode}${plan ? ` · ${plan.name}: ${rupees(plan.annualAmount)} a year, ${rupees(plan.monthlyAmount)} a month` : ""}`} />
      <div className="mb-6"><SummaryCards s={summary} /></div>

      <div className="grid lg:grid-cols-5 gap-4 mb-6">
        <section className="lg:col-span-2">
          <h2 className="font-semibold mb-2">Installments</h2>
          <div className="card p-0">
            <ul className="divide-y divide-stone-100 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="font-medium w-20">{monthLabel(r.periodMonth)}</span>
                  <span className="text-xs text-stone-500">due {fmtDate(r.dueDate)}</span>
                  <span className="ml-auto">{rupees(r.amount + r.lateFee)}</span>
                  <InvoiceBadge s={r.display} />
                  {r.lateFee > 0 && <span className="w-full text-xs text-red-700">Includes {rupees(r.lateFee)} late fee</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="lg:col-span-3">
          <h2 className="font-semibold mb-2">Pay by UPI</h2>
          {open.length === 0
            ? <div className="card text-sm text-stone-600">Nothing to pay right now. Jazakallah khair!</div>
            : <PayForm open={open} upiId={plan?.upiId ?? null} upiName={plan?.upiName ?? null} familyCode={fam.familyCode} today={toDateInput(now)} />}
          <p className="text-xs text-stone-500 mt-2">You can also pay by cash or bank transfer at the Mahall office.</p>
        </section>
      </div>

      <section>
        <h2 className="font-semibold mb-2">Payment history</h2>
        <PaymentHistory payments={payments} receiptBase="/subscriptions/receipt" />
      </section>
    </>
  );
}
