import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { familyLedger, applyLateFees, rupees, monthLabel } from "@/lib/billing";
import { fmtDate, toDateInput } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { InvoiceBadge, SummaryCards, PaymentHistory } from "@/components/billing";
import { waiveInvoice, adjustInvoice, setExemption } from "../../actions";
import { recordPayment } from "../../../payments/actions";

export default async function FamilySubscriptionPage({ params }: { params: Promise<{ familyId: string }> }) {
  const user = await requireAdmin();
  const { familyId } = await params;
  const family = await db.family.findFirst({ where: { id: familyId, masjidId: user.masjidId }, include: { headMember: { select: { fullName: true } } } });
  if (!family) notFound();
  await applyLateFees(user.masjidId);
  const { rows, payments, summary } = await familyLedger(user.masjidId, family.id);
  const open = rows.filter((r) => r.owed - r.pendingAllocated > 0);

  return (
    <>
      <PageHeader title={`${family.familyName} · Subscription`}
        subtitle={`${family.familyCode} · Head: ${family.headMember?.fullName ?? "—"} · ${family.primaryPhone ?? "no phone"}`}
        actions={<>
          <Link href={`/admin/families/${family.id}`} className="btn-outline">Family profile</Link>
          <Link href="/admin/subscriptions" className="btn-outline">Plans</Link>
        </>} />
      {family.subscriptionExempt && (
        <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">Exempt from subscription: {family.exemptReason}</div>
      )}
      {rows.length > 0 && <div className="mb-6"><SummaryCards s={summary} /></div>}

      <div className="grid lg:grid-cols-5 gap-4 mb-6">
        <section className="lg:col-span-3">
          <h2 className="font-semibold mb-2">Installments</h2>
          {rows.length === 0 ? <div className="card"><Empty>No installments. Generate them from a subscription plan.</Empty></div> : (
            <div className="space-y-1.5">
              {rows.map((r) => (
                <details key={r.id} className="card p-0">
                  <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 cursor-pointer list-none text-sm">
                    <span className="font-medium w-20">{monthLabel(r.periodMonth)}</span>
                    <span className="text-stone-500">due {fmtDate(r.dueDate)}</span>
                    <span className="ml-auto">{rupees(r.amount + r.lateFee)}{r.lateFee > 0 && <span className="text-xs text-red-700"> (incl. {rupees(r.lateFee)} late fee)</span>}</span>
                    {r.paidAmount > 0 && r.owed > 0 && <span className="text-xs text-stone-500">paid {rupees(r.paidAmount)}</span>}
                    <InvoiceBadge s={r.display} />
                  </summary>
                  <div className="border-t border-stone-200 p-4 grid sm:grid-cols-2 gap-4">
                    {r.note && <p className="col-span-full text-xs text-stone-600">Note: {r.note}</p>}
                    <ActionForm action={adjustInvoice} className="grid gap-2 content-start" submit="Adjust">
                      <input type="hidden" name="id" value={r.id} />
                      <div className="text-sm font-medium">Adjust amount</div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="field"><span>Installment ₹</span><input name="amount" type="number" min={0} defaultValue={r.amount} /></label>
                        <label className="field"><span>Late fee ₹</span><input name="lateFee" type="number" min={0} defaultValue={r.lateFee} /></label>
                      </div>
                      <label className="field"><span>Reason *</span><input name="reason" required /></label>
                    </ActionForm>
                    <ActionForm action={waiveInvoice} className="grid gap-2 content-start" submit={r.status === "WAIVED" ? "Remove waiver" : "Waive installment"}>
                      <input type="hidden" name="id" value={r.id} />
                      <div className="text-sm font-medium">{r.status === "WAIVED" ? "Remove waiver" : "Waive"}</div>
                      <label className="field"><span>Reason *</span><input name="reason" required /></label>
                    </ActionForm>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-2 space-y-4">
          <div>
            <h2 className="font-semibold mb-2">Record payment</h2>
            {open.length === 0 ? <div className="card text-sm text-stone-500">Nothing is owed right now.</div> : (
              <ActionForm action={recordPayment} resetOnOk className="card grid gap-3" submit="Record payment">
                <input type="hidden" name="familyId" value={family.id} />
                <fieldset className="text-sm">
                  <legend className="font-medium text-stone-700 mb-1">Installments (none ticked = oldest first)</legend>
                  <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                    {open.map((r) => (
                      <label key={r.id} className="flex items-center gap-1.5">
                        <input type="checkbox" name="invoiceIds" value={r.id} />{monthLabel(r.periodMonth)} · {rupees(r.owed - r.pendingAllocated)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-2">
                  <label className="field"><span>Amount ₹ *</span><input name="amount" type="number" min={1} required /></label>
                  <label className="field"><span>Paid on</span><input name="paidOn" type="date" defaultValue={toDateInput(new Date())} /></label>
                </div>
                <label className="field"><span>Method *</span>
                  <select name="method" defaultValue="CASH"><option value="CASH">Cash</option><option value="UPI_MANUAL">UPI</option><option value="BANK_TRANSFER">Bank transfer</option></select>
                </label>
                <label className="field"><span>Reference (UTR / bank ref, not needed for cash)</span><input name="reference" /></label>
                <label className="field"><span>Notes</span><input name="notes" /></label>
              </ActionForm>
            )}
          </div>
          <div>
            <h2 className="font-semibold mb-2">Exemption</h2>
            <ActionForm action={setExemption} className="card grid gap-2" submit={family.subscriptionExempt ? "Remove exemption" : "Exempt this family"}>
              <input type="hidden" name="familyId" value={family.id} />
              <input type="hidden" name="exempt" value={family.subscriptionExempt ? "0" : "1"} />
              {!family.subscriptionExempt && <label className="field"><span>Reason</span><input name="reason" placeholder="e.g. financial hardship, approved by committee" /></label>}
            </ActionForm>
          </div>
        </section>
      </div>

      <section>
        <h2 className="font-semibold mb-2">Payment history</h2>
        <PaymentHistory payments={payments} receiptBase="/admin/payments/receipt" />
      </section>
    </>
  );
}
