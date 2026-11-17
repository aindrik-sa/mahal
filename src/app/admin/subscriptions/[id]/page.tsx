import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rupees } from "@/lib/billing";
import { planCollection } from "@/lib/collection";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { PlanFields } from "../plan-fields";
import { updatePlan, runGeneration } from "../actions";

const FILTERS = { all: "All", overdue: "Overdue", pending: "Pending now", paid: "Fully paid" } as const;

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; q?: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const plan = await db.subscriptionPlan.findFirst({ where: { id, masjidId: user.masjidId }, include: { _count: { select: { invoices: true } } } });
  if (!plan) notFound();
  const { rows, totals } = await planCollection(user.masjidId, plan.id);
  const f = (sp.f && sp.f in FILTERS ? sp.f : "all") as keyof typeof FILTERS;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = rows.filter((r) =>
    (f === "all" || (f === "overdue" && r.overdue > 0) || (f === "pending" && r.owedNow > 0) || (f === "paid" && r.owed === 0)) &&
    (!q || r.familyName.toLowerCase().includes(q) || r.familyCode.toLowerCase().includes(q) || r.houseNumber?.toLowerCase() === q));
  const pct = totals.due ? Math.round((totals.paid / totals.due) * 100) : 0;

  return (
    <>
      <PageHeader title={plan.name} subtitle={`${rupees(plan.annualAmount)} per family per year · ${rupees(plan.monthlyAmount)} due on day ${plan.dueDay} each month`}
        actions={<>
          <Link href="/admin/subscriptions" className="btn-outline">All plans</Link>
          <a href={`/admin/subscriptions/${plan.id}/export?f=${f}`} className="btn-outline">Export CSV</a>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Collected" value={rupees(totals.paid)} hint={`${pct}% of ${rupees(totals.due)} billed`} />
        <Stat label="Pending now" value={rupees(totals.owedNow)} hint="Installments already due" />
        <Stat label="Awaiting verification" value={rupees(totals.awaiting)} href="/admin/payments" />
        <Stat label="Families overdue" value={totals.overdueFamilies} hint={`of ${rows.length} billed`} />
      </div>

      <ActionForm action={runGeneration} className="card flex flex-wrap items-center gap-3 mb-6" submit={plan._count.invoices ? "Generate for new families" : "Generate monthly installments"} pendingLabel="Generating…">
        <input type="hidden" name="id" value={plan.id} />
        <p className="text-sm text-stone-600 flex-1 min-w-64">
          {plan._count.invoices
            ? `${plan._count.invoices} installments exist. Run again after registering new families; existing ones are not touched.`
            : "Creates one installment per month for every active family that isn't exempt."}
        </p>
      </ActionForm>

      <section className="mb-6">
        <form className="flex flex-wrap gap-2 mb-3">
          <input name="q" defaultValue={sp.q} placeholder="Search family, ID, house no." className="input flex-1 min-w-48" />
          <select name="f" defaultValue={f} className="input">{Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn-outline">Filter</button>
        </form>
        <div className="card p-0 overflow-x-auto">
          {shown.length === 0 ? <Empty>No families match.</Empty> : (
            <table className="table">
              <thead><tr><th>Family</th><th>House</th><th className="text-right">Billed</th><th className="text-right">Paid</th><th className="text-right">Due now</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.familyId}>
                    <td><Link className="font-medium text-emerald-800 hover:underline" href={`/admin/subscriptions/family/${r.familyId}`}>{r.familyName}</Link> <span className="text-xs text-stone-500">{r.familyCode}</span></td>
                    <td>{[r.houseNumber, r.ward].filter(Boolean).join(", ") || "—"}</td>
                    <td className="text-right">{rupees(r.due)}</td>
                    <td className="text-right">{rupees(r.paid)}</td>
                    <td className="text-right font-medium">{r.owedNow ? rupees(r.owedNow) : "—"}</td>
                    <td className="space-x-1 whitespace-nowrap">
                      {r.overdue > 0 && <span className="badge bg-red-100 text-red-800">{r.overdue} overdue</span>}
                      {r.awaiting > 0 && <span className="badge bg-amber-100 text-amber-800">Awaiting {rupees(r.awaiting)}</span>}
                      {r.owed === 0 && <span className="badge bg-emerald-100 text-emerald-800">Paid in full</span>}
                      {r.waived > 0 && <span className="badge bg-violet-100 text-violet-800">{r.waived} waived</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Plan settings</h2>
        <ActionForm action={updatePlan} className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3" submit="Save plan">
          <input type="hidden" name="id" value={plan.id} />
          <PlanFields p={plan} locked={plan._count.invoices > 0} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={plan.isActive} /> Plan is active</label>
        </ActionForm>
      </section>
    </>
  );
}
