import type { Prisma, SubscriptionInvoice, SubscriptionPlan } from "@prisma/client";
import { db } from "./db";
import { recordSubscriptionIncome } from "./finance";

export type DisplayStatus = "PAID" | "PENDING" | "PARTIAL" | "OVERDUE" | "WAIVED" | "AWAITING";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  PAID: "Paid", PENDING: "Pending", PARTIAL: "Partially paid", OVERDUE: "Overdue", WAIVED: "Waived", AWAITING: "Awaiting verification",
};
export const STATUS_STYLE: Record<DisplayStatus, string> = {
  PAID: "bg-emerald-100 text-emerald-800", PENDING: "bg-stone-200 text-stone-700", PARTIAL: "bg-sky-100 text-sky-800",
  OVERDUE: "bg-red-100 text-red-800", WAIVED: "bg-violet-100 text-violet-800", AWAITING: "bg-amber-100 text-amber-800",
};
export const METHOD_LABEL = { UPI_MANUAL: "UPI", CASH: "Cash", BANK_TRANSFER: "Bank transfer" } as const;

export const rupees = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN")}`;

/** Amount still owed on an installment. */
export const outstanding = (i: Pick<SubscriptionInvoice, "amount" | "lateFee" | "paidAmount" | "status">) =>
  i.status === "WAIVED" ? 0 : Math.max(0, i.amount + i.lateFee - i.paidAmount);

export function graceEnd(i: { dueDate: Date }, plan: { graceDays: number }) {
  return new Date(i.dueDate.getTime() + plan.graceDays * 864e5);
}

/**
 * The status shown to people. Stored status only knows PENDING/PARTIAL/PAID/WAIVED;
 * Overdue and Awaiting verification are derived.
 */
export function displayStatus(
  i: SubscriptionInvoice & { plan: Pick<SubscriptionPlan, "graceDays"> },
  hasPendingPayment: boolean,
  now = new Date(),
): DisplayStatus {
  if (i.status === "WAIVED") return "WAIVED";
  if (outstanding(i) === 0) return "PAID";
  if (hasPendingPayment) return "AWAITING";
  if (now > graceEnd(i, i.plan)) return "OVERDUE";
  if (i.paidAmount > 0) return "PARTIAL";
  return "PENDING";
}

const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
export const monthLabel = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function dueDateFor(month: Date, dueDay: number) {
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(dueDay, lastDay)));
}

/**
 * Creates monthly invoices for every active, non-exempt family for every month of the plan.
 * Idempotent: rerunning only adds invoices for families registered since (unique planId+familyId+month).
 * Months that have already passed before a family registered are skipped.
 */
export async function generateInvoices(plan: SubscriptionPlan) {
  const families = await db.family.findMany({
    where: { masjidId: plan.masjidId, status: "ACTIVE", subscriptionExempt: false },
    select: { id: true, registrationDate: true },
  });
  const rows: Prisma.SubscriptionInvoiceCreateManyInput[] = [];
  for (const f of families) {
    const firstEligible = startOfMonth(f.registrationDate);
    for (let k = 0; k < plan.months; k++) {
      const month = addMonths(plan.startMonth, k);
      if (month < firstEligible) continue;
      rows.push({ masjidId: plan.masjidId, planId: plan.id, familyId: f.id, periodMonth: month, dueDate: dueDateFor(month, plan.dueDay), amount: plan.monthlyAmount });
    }
  }
  const r = await db.subscriptionInvoice.createMany({ data: rows, skipDuplicates: true });
  return r.count;
}

/** Adds the plan's late fee to unpaid installments past due date + grace. Safe to call often. */
export async function applyLateFees(masjidId: string) {
  const plans = await db.subscriptionPlan.findMany({ where: { masjidId, lateFee: { gt: 0 } } });
  for (const p of plans) {
    await db.subscriptionInvoice.updateMany({
      where: { planId: p.id, status: { in: ["PENDING", "PARTIAL"] }, lateFee: 0, dueDate: { lt: new Date(Date.now() - p.graceDays * 864e5) } },
      data: { lateFee: p.lateFee },
    });
  }
}

/** Splits an amount across invoices oldest-first. Returns null if the amount exceeds what is owed. */
export function allocate(invoices: (SubscriptionInvoice & { pendingAllocated?: number })[], amount: number) {
  const sorted = [...invoices].sort((a, b) => a.periodMonth.getTime() - b.periodMonth.getTime());
  const out: { invoiceId: string; amount: number }[] = [];
  let left = amount;
  for (const inv of sorted) {
    if (left <= 0) break;
    const owed = outstanding(inv) - (inv.pendingAllocated ?? 0);
    if (owed <= 0) continue;
    const a = Math.min(owed, left);
    out.push({ invoiceId: inv.id, amount: a });
    left -= a;
  }
  return left > 0 ? null : out;
}

/** Applies a payment's allocations to its invoices and issues a receipt number. Call inside a transaction. */
export async function settlePayment(tx: Prisma.TransactionClient, paymentId: string, verifierId: string) {
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: { include: { invoice: true } } } });
  if (p.status !== "PENDING_VERIFICATION") throw new Error("Payment already processed");
  for (const a of p.allocations) {
    const inv = a.invoice;
    const paid = inv.paidAmount + a.amount;
    await tx.subscriptionInvoice.update({
      where: { id: inv.id },
      data: { paidAmount: paid, status: paid >= inv.amount + inv.lateFee ? "PAID" : "PARTIAL" },
    });
  }
  const m = await tx.masjid.update({ where: { id: p.masjidId }, data: { receiptSeq: { increment: 1 } } });
  const done = await tx.payment.update({
    where: { id: p.id },
    data: { status: "VERIFIED", verifiedById: verifierId, verifiedAt: new Date(), receiptNo: `RCP-${String(m.receiptSeq).padStart(5, "0")}` },
  });
  // Every verified subscription payment shows up in the masjid's income ledger.
  await recordSubscriptionIncome(tx, done, verifierId);
  return done;
}

/** Everything a family's subscription page needs. */
export async function familyLedger(masjidId: string, familyId: string) {
  const [invoices, payments] = await Promise.all([
    db.subscriptionInvoice.findMany({
      where: { masjidId, familyId },
      orderBy: { periodMonth: "asc" },
      include: { plan: true, allocations: { where: { payment: { status: "PENDING_VERIFICATION" } }, select: { amount: true } } },
    }),
    db.payment.findMany({ where: { masjidId, familyId }, orderBy: { createdAt: "desc" }, include: { allocations: { include: { invoice: { select: { periodMonth: true } } } } } }),
  ]);
  const now = new Date();
  const rows = invoices.map((i) => {
    const pendingAllocated = i.allocations.reduce((s, a) => s + a.amount, 0);
    return { ...i, pendingAllocated, owed: outstanding(i), display: displayStatus(i, pendingAllocated > 0, now) };
  });
  const active = rows.filter((r) => r.plan.isActive);
  const current = active.length ? active : rows;
  const plan = current[0]?.plan ?? null;
  const totalDue = current.reduce((s, r) => s + (r.status === "WAIVED" ? 0 : r.amount + r.lateFee), 0);
  const paid = current.reduce((s, r) => s + r.paidAmount, 0);
  const pendingTotal = current.filter((r) => r.dueDate <= now || r.display === "OVERDUE").reduce((s, r) => s + r.owed, 0);
  const next = current.find((r) => r.owed > 0 && r.display !== "AWAITING");
  return {
    plan, rows, payments,
    summary: {
      annual: totalDue, paid, remaining: current.reduce((s, r) => s + r.owed, 0), dueNow: pendingTotal,
      overdueCount: current.filter((r) => r.display === "OVERDUE").length,
      nextDue: next ? { date: next.dueDate, amount: next.owed, month: next.periodMonth } : null,
      awaiting: payments.filter((p) => p.status === "PENDING_VERIFICATION").reduce((s, p) => s + p.amount, 0),
    },
  };
}
