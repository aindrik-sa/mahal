import Link from "next/link";
import { STATUS_LABEL, STATUS_STYLE, METHOD_LABEL, rupees, monthLabel, type DisplayStatus } from "@/lib/billing";
import { fmtDate } from "@/lib/format";
import type { Payment, PaymentAllocation } from "@prisma/client";

export function InvoiceBadge({ s }: { s: DisplayStatus }) {
  return <span className={`badge ${STATUS_STYLE[s]}`}>{STATUS_LABEL[s]}</span>;
}

export function PaymentBadge({ s }: { s: Payment["status"] }) {
  const map = { PENDING_VERIFICATION: ["Awaiting verification", "bg-amber-100 text-amber-800"], VERIFIED: ["Verified", "bg-emerald-100 text-emerald-800"], REJECTED: ["Rejected", "bg-red-100 text-red-800"] } as const;
  return <span className={`badge ${map[s][1]}`}>{map[s][0]}</span>;
}

export function SummaryCards({ s }: { s: { annual: number; paid: number; remaining: number; dueNow: number; overdueCount: number; nextDue: { date: Date; amount: number } | null; awaiting: number } }) {
  const Card = ({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) => (
    <div className={`card ${tone ?? ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-xs text-stone-500 mt-1">{hint}</div>}
    </div>
  );
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card label="Annual subscription" value={rupees(s.annual)} hint={`Paid ${rupees(s.paid)} · Remaining ${rupees(s.remaining)}`} />
      <Card label="Due now" value={rupees(s.dueNow)} hint={s.overdueCount ? `${s.overdueCount} installment${s.overdueCount > 1 ? "s" : ""} overdue` : "Nothing overdue"}
        tone={s.overdueCount ? "border-red-300 bg-red-50" : ""} />
      <Card label="Next due" value={s.nextDue ? rupees(s.nextDue.amount) : "—"} hint={s.nextDue ? `on ${fmtDate(s.nextDue.date)}` : "All paid"} />
      <Card label="Awaiting verification" value={rupees(s.awaiting)} hint="Submitted UPI payments" />
    </div>
  );
}

type PaymentRow = Payment & { allocations: (PaymentAllocation & { invoice: { periodMonth: Date } })[] };

export function PaymentHistory({ payments, receiptBase }: { payments: PaymentRow[]; receiptBase: string }) {
  if (!payments.length) return <div className="text-sm text-stone-500 py-4">No payments yet.</div>;
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="table">
        <thead><tr><th>Date</th><th className="text-right">Amount</th><th>Method</th><th>Reference</th><th>For</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap">{fmtDate(p.paidOn)}</td>
              <td className="text-right font-medium">{rupees(p.amount)}</td>
              <td>{METHOD_LABEL[p.method]}</td>
              <td className="font-mono text-xs">{p.reference ?? "—"}</td>
              <td className="text-xs">{p.allocations.map((a) => monthLabel(a.invoice.periodMonth)).join(", ")}</td>
              <td><PaymentBadge s={p.status} />{p.rejectReason && <div className="text-xs text-red-700 mt-1">{p.rejectReason}</div>}</td>
              <td>{p.receiptNo && <Link className="text-emerald-800 hover:underline whitespace-nowrap" href={`${receiptBase}/${p.id}`}>{p.receiptNo}</Link>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
