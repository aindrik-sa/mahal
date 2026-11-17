import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rupees, monthLabel, METHOD_LABEL } from "@/lib/billing";
import { fmtDate } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { PaymentBadge } from "@/components/billing";
import { verifyPayment, rejectPayment } from "./actions";

const PAGE = 50;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const include = {
    family: { select: { id: true, familyName: true, familyCode: true } },
    submittedBy: { select: { name: true } },
    allocations: { include: { invoice: { select: { periodMonth: true } } } },
  } satisfies Prisma.PaymentInclude;

  const pending = await db.payment.findMany({ where: { masjidId: user.masjidId, status: "PENDING_VERIFICATION" }, orderBy: { createdAt: "asc" }, include });
  const where: Prisma.PaymentWhereInput = {
    masjidId: user.masjidId, status: { not: "PENDING_VERIFICATION" },
    ...(q && { OR: [
      { reference: { contains: q, mode: "insensitive" } }, { receiptNo: { contains: q, mode: "insensitive" } },
      { family: { familyName: { contains: q, mode: "insensitive" } } }, { family: { familyCode: { contains: q, mode: "insensitive" } } },
    ] }),
  };
  const [history, total] = await Promise.all([
    db.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include }),
    db.payment.count({ where }),
  ]);

  return (
    <>
      <PageHeader title="Payment Management" subtitle="Verify UPI payments submitted by residents. Record cash and bank payments from a family's subscription page." />

      <section className="mb-8">
        <h2 className="font-semibold mb-2">Awaiting verification ({pending.length})</h2>
        {pending.length === 0 ? <div className="card"><Empty>Nothing to verify.</Empty></div> : (
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="card grid gap-3 md:grid-cols-[1fr_auto] items-start">
                <div className="text-sm space-y-0.5">
                  <div className="flex flex-wrap gap-x-3 items-baseline">
                    <span className="text-lg font-semibold">{rupees(p.amount)}</span>
                    <Link href={`/admin/subscriptions/family/${p.family.id}`} className="font-medium text-emerald-800 hover:underline">{p.family.familyName}</Link>
                    <span className="text-xs text-stone-500">{p.family.familyCode}</span>
                  </div>
                  <div>UPI reference: <span className="font-mono font-medium">{p.reference}</span> · paid {fmtDate(p.paidOn)}</div>
                  <div className="text-stone-600">For {p.allocations.map((a) => monthLabel(a.invoice.periodMonth)).join(", ")} · submitted by {p.submittedBy?.name ?? "—"} on {fmtDate(p.createdAt)}</div>
                  {p.notes && <div className="text-stone-600">Note: {p.notes}</div>}
                  <p className="text-xs text-stone-500 pt-1">Check this reference and amount in the masjid&apos;s UPI or bank statement before verifying.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  <ActionForm action={verifyPayment} submit="Verify" pendingLabel="Verifying…"><input type="hidden" name="id" value={p.id} /></ActionForm>
                  <details>
                    <summary className="btn-danger cursor-pointer list-none">Reject</summary>
                    <ActionForm action={rejectPayment} className="mt-2 grid gap-2 w-64" submit="Confirm reject">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="field"><span>Reason (shown to resident)</span><input name="reason" required placeholder="Reference not found in statement" /></label>
                    </ActionForm>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap justify-between items-end gap-2 mb-2">
          <h2 className="font-semibold">All payments</h2>
          <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Family, receipt no. or reference" className="input w-64" /><button className="btn-outline">Search</button></form>
        </div>
        <div className="card p-0 overflow-x-auto">
          {history.length === 0 ? <Empty>No payments yet.</Empty> : (
            <table className="table">
              <thead><tr><th>Receipt</th><th>Date</th><th>Family</th><th className="text-right">Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs">{p.receiptNo ? <Link className="text-emerald-800 hover:underline" href={`/admin/payments/receipt/${p.id}`}>{p.receiptNo}</Link> : "—"}</td>
                    <td className="whitespace-nowrap">{fmtDate(p.paidOn)}</td>
                    <td><Link className="hover:underline" href={`/admin/subscriptions/family/${p.family.id}`}>{p.family.familyName}</Link></td>
                    <td className="text-right font-medium">{rupees(p.amount)}</td>
                    <td>{METHOD_LABEL[p.method]}</td>
                    <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                    <td><PaymentBadge s={p.status} />{p.rejectReason && <div className="text-xs text-red-700">{p.rejectReason}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          {page > 1 && <Link className="btn-outline" href={`?${new URLSearchParams({ ...(q && { q }), page: String(page - 1) })}`}>Newer</Link>}
          {page * PAGE < total && <Link className="btn-outline" href={`?${new URLSearchParams({ ...(q && { q }), page: String(page + 1) })}`}>Older</Link>}
        </div>
      </section>
    </>
  );
}
