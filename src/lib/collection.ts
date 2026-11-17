import { db } from "./db";
import { outstanding, graceEnd, applyLateFees } from "./billing";

export type FamilyRow = {
  familyId: string; familyCode: string; familyName: string; houseNumber: string | null; ward: string | null; phone: string | null;
  due: number; paid: number; owed: number; owedNow: number; overdue: number; awaiting: number; waived: number;
};

/** Per-family collection figures for one plan. "owedNow" counts only installments whose due date has passed. */
export async function planCollection(masjidId: string, planId: string) {
  await applyLateFees(masjidId);
  const invoices = await db.subscriptionInvoice.findMany({
    where: { masjidId, planId },
    include: {
      plan: { select: { graceDays: true } },
      family: { select: { familyCode: true, familyName: true, houseNumber: true, ward: true, primaryPhone: true } },
      allocations: { where: { payment: { status: "PENDING_VERIFICATION" } }, select: { amount: true } },
    },
  });
  const now = new Date();
  const map = new Map<string, FamilyRow>();
  for (const i of invoices) {
    let r = map.get(i.familyId);
    if (!r) {
      r = { familyId: i.familyId, familyCode: i.family.familyCode, familyName: i.family.familyName, houseNumber: i.family.houseNumber,
        ward: i.family.ward, phone: i.family.primaryPhone, due: 0, paid: 0, owed: 0, owedNow: 0, overdue: 0, awaiting: 0, waived: 0 };
      map.set(i.familyId, r);
    }
    const owed = outstanding(i);
    const pend = i.allocations.reduce((s, a) => s + a.amount, 0);
    if (i.status === "WAIVED") { r.waived++; continue; }
    r.due += i.amount + i.lateFee;
    r.paid += i.paidAmount;
    r.owed += owed;
    r.awaiting += pend;
    if (i.dueDate <= now) r.owedNow += owed;
    if (owed > 0 && pend === 0 && now > graceEnd(i, i.plan)) r.overdue++;
  }
  const rows = [...map.values()].sort((a, b) => a.familyCode.localeCompare(b.familyCode));
  const totals = rows.reduce(
    (t, r) => ({ due: t.due + r.due, paid: t.paid + r.paid, owedNow: t.owedNow + r.owedNow, awaiting: t.awaiting + r.awaiting,
      overdueFamilies: t.overdueFamilies + (r.overdue > 0 ? 1 : 0) }),
    { due: 0, paid: 0, owedNow: 0, awaiting: 0, overdueFamilies: 0 },
  );
  return { rows, totals };
}
