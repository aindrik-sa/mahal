import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rupees, monthLabel, addMonths } from "@/lib/billing";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { PlanFields } from "./plan-fields";
import { createPlan } from "./actions";

export default async function SubscriptionsPage() {
  const user = await requireAdmin();
  const plans = await db.subscriptionPlan.findMany({ where: { masjidId: user.masjidId }, orderBy: { startMonth: "desc" }, include: { _count: { select: { invoices: true } } } });
  const exempt = await db.family.count({ where: { masjidId: user.masjidId, status: "ACTIVE", subscriptionExempt: true } });
  return (
    <>
      <PageHeader title="Subscription Management" subtitle="Annual subscription collected in monthly installments, per family."
        actions={<Link href="/admin/payments" className="btn-outline">Payments</Link>} />
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Subscription plans</h2>
        {plans.length === 0 ? <div className="card"><Empty>No plan yet. Create one below.</Empty></div> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {plans.map((p) => (
              <Link key={p.id} href={`/admin/subscriptions/${p.id}`} className="card hover:border-emerald-400">
                <div className="flex justify-between items-start">
                  <div className="font-semibold">{p.name}</div>
                  <span className={`badge ${p.isActive ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{p.isActive ? "Active" : "Closed"}</span>
                </div>
                <div className="text-sm text-stone-600 mt-1">
                  {monthLabel(p.startMonth)} – {monthLabel(addMonths(p.startMonth, p.months - 1))} · {rupees(p.annualAmount)}/year · {rupees(p.monthlyAmount)}/month
                </div>
                <div className="text-xs text-stone-500 mt-1">{p._count.invoices} installments generated</div>
              </Link>
            ))}
          </div>
        )}
        {exempt > 0 && <p className="text-xs text-stone-500 mt-2">{exempt} families are exempt from subscription.</p>}
      </section>
      <section>
        <h2 className="font-semibold mb-2">New plan</h2>
        <ActionForm action={createPlan} className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3" submit="Create plan">
          <PlanFields />
        </ActionForm>
      </section>
    </>
  );
}
