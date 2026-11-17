import { db } from "@/lib/db";
import { rupees, monthLabel, METHOD_LABEL } from "@/lib/billing";
import { fmtDate } from "@/lib/format";
import { PrintButton } from "./print-button";

/** Printable receipt. Caller must already have checked the viewer may see this payment. */
export async function Receipt({ paymentId, masjidId }: { paymentId: string; masjidId: string }) {
  const p = await db.payment.findFirst({
    where: { id: paymentId, masjidId, status: "VERIFIED" },
    include: { masjid: true, family: { include: { headMember: { select: { fullName: true } } } }, verifiedBy: { select: { name: true } },
      allocations: { include: { invoice: { select: { periodMonth: true, plan: { select: { name: true } } } } } } },
  });
  if (!p) return <div className="card text-sm">Receipt not found.</div>;
  return (
    <div className="max-w-xl">
      <div className="flex justify-end mb-3 print:hidden"><PrintButton /></div>
      <div className="card print:shadow-none print:border-0">
        <div className="text-center border-b border-stone-200 pb-3 mb-3">
          <div className="text-xl font-bold text-emerald-800">{p.masjid.name}</div>
          {p.masjid.address && <div className="text-sm text-stone-600">{p.masjid.address}</div>}
          <div className="mt-2 text-sm font-semibold tracking-wide uppercase">Subscription receipt</div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-stone-500">Receipt no.</dt><dd className="font-mono font-semibold">{p.receiptNo}</dd>
          <dt className="text-stone-500">Date</dt><dd>{fmtDate(p.paidOn)}</dd>
          <dt className="text-stone-500">Family</dt><dd>{p.family.familyName} ({p.family.familyCode})</dd>
          <dt className="text-stone-500">Family head</dt><dd>{p.family.headMember?.fullName ?? "—"}</dd>
          <dt className="text-stone-500">Method</dt><dd>{METHOD_LABEL[p.method]}{p.reference && ` · ref ${p.reference}`}</dd>
        </dl>
        <table className="table mt-4">
          <thead><tr><th>Installment</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {p.allocations.map((a) => (
              <tr key={a.id}><td>{a.invoice.plan.name} · {monthLabel(a.invoice.periodMonth)}</td><td className="text-right">{rupees(a.amount)}</td></tr>
            ))}
            <tr><td className="font-semibold">Total received</td><td className="text-right font-semibold">{rupees(p.amount)}</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-stone-500 mt-4">Verified by {p.verifiedBy?.name ?? "—"} on {fmtDate(p.verifiedAt)}. Computer-generated receipt.</p>
      </div>
    </div>
  );
}
