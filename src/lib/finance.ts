import type { ExpenseCategory, FinanceMethod, IncomeCategory, Prisma } from "@prisma/client";
import { db } from "./db";

export const INCOME_CATEGORY_LABEL: Record<IncomeCategory, string> = {
  SUBSCRIPTION: "Annual subscriptions", DONATION: "Donations", ZAKAT: "Zakat / designated contributions", EVENT_COLLECTION: "Event collections", OTHER: "Other income",
};
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  ELECTRICITY: "Electricity", WATER: "Water", MAINTENANCE: "Maintenance", STAFF_SALARY: "Staff salary", RELIGIOUS_ACTIVITIES: "Religious activities",
  COMMUNITY_EVENTS: "Community events", CONSTRUCTION: "Construction & renovation", OTHER: "Other expenses",
};
export const FINANCE_METHOD_LABEL: Record<FinanceMethod, string> = { CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", OTHER: "Other" };

/** IST calendar date (YYYY-MM-DD) → instant at IST midnight. */
export const istDay = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
const IST_MS = 330 * 60000;
/** Year and 0-based month of an instant in IST. */
export const istYM = (d: Date) => { const x = new Date(d.getTime() + IST_MS); return { y: x.getUTCFullYear(), m: x.getUTCMonth() }; };
export const istYmd = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

/** Indian financial year (April–March) identified by its starting calendar year. */
export const fyOf = (d: Date) => { const { y, m } = istYM(d); return m >= 3 ? y : y - 1; };
export const fyRange = (fy: number) => ({ from: istDay(`${fy}-04-01`), to: istDay(`${fy + 1}-04-01`) });
export const fyLabel = (fy: number) => `FY ${fy}-${String(fy + 1).slice(2)}`;
export const FY_MONTHS = (fy: number) => Array.from({ length: 12 }, (_, i) => ({ y: i < 9 ? fy : fy + 1, m: (i + 3) % 12 }));
export const monthName = (m: number, y?: number) => new Date(Date.UTC(y ?? 2000, m, 1)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) + (y ? ` ${String(y).slice(2)}` : "");

/** Allocates the next INC-/EXP- code inside a transaction. */
export async function nextTxnCode(tx: Prisma.TransactionClient, masjidId: string, kind: "income" | "expense") {
  const field = kind === "income" ? "incomeSeq" : "expenseSeq";
  const m = await tx.masjid.update({ where: { id: masjidId }, data: { [field]: { increment: 1 } } });
  return `${kind === "income" ? "INC" : "EXP"}-${String(kind === "income" ? m.incomeSeq : m.expenseSeq).padStart(5, "0")}`;
}

/** Records a verified subscription payment as income. Idempotent via the unique paymentId. */
export async function recordSubscriptionIncome(
  tx: Prisma.TransactionClient,
  p: { id: string; masjidId: string; amount: number; method: "UPI_MANUAL" | "CASH" | "BANK_TRANSFER"; reference: string | null; paidOn: Date; receiptNo: string | null; familyId: string },
  recordedById: string,
) {
  if (await tx.income.findUnique({ where: { paymentId: p.id } })) return;
  const fam = await tx.family.findUnique({ where: { id: p.familyId }, select: { familyCode: true } });
  await tx.income.create({
    data: {
      masjidId: p.masjidId, txnCode: await nextTxnCode(tx, p.masjidId, "income"), category: "SUBSCRIPTION",
      description: `Subscription ${p.receiptNo ?? ""} (${fam?.familyCode ?? "family"})`.trim(), amount: p.amount, date: p.paidOn,
      method: p.method === "UPI_MANUAL" ? "UPI" : p.method, reference: p.reference, paymentId: p.id, recordedById,
    },
  });
}

type Range = { from: Date; to: Date };

/** Totals, monthly series and category breakdowns for a date range. Voided records are excluded. */
export async function financeSummary(masjidId: string, range: Range) {
  const where = { masjidId, voidedAt: null, date: { gte: range.from, lt: range.to } };
  const [incomes, expenses, masjid] = await Promise.all([
    db.income.findMany({ where, select: { amount: true, date: true, category: true } }),
    db.expense.findMany({ where, select: { amount: true, date: true, category: true } }),
    db.masjid.findUniqueOrThrow({ where: { id: masjidId }, select: { openingBalance: true, openingBalanceDate: true } }),
  ]);
  const monthly = new Map<string, { income: number; expense: number }>();
  const key = (d: Date) => { const { y, m } = istYM(d); return `${y}-${m}`; };
  for (const i of incomes) { const k = key(i.date); const v = monthly.get(k) ?? { income: 0, expense: 0 }; v.income += i.amount; monthly.set(k, v); }
  for (const e of expenses) { const k = key(e.date); const v = monthly.get(k) ?? { income: 0, expense: 0 }; v.expense += e.amount; monthly.set(k, v); }
  const byIncome = new Map<IncomeCategory, number>();
  for (const i of incomes) byIncome.set(i.category, (byIncome.get(i.category) ?? 0) + i.amount);
  const byExpense = new Map<ExpenseCategory, number>();
  for (const e of expenses) byExpense.set(e.category, (byExpense.get(e.category) ?? 0) + e.amount);
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  return {
    totalIncome, totalExpense, net: totalIncome - totalExpense,
    balance: await balanceAt(masjidId, range.to, masjid),
    monthly: (y: number, m: number) => monthly.get(`${y}-${m}`) ?? { income: 0, expense: 0 },
    byIncome: [...byIncome.entries()].sort((a, b) => b[1] - a[1]),
    byExpense: [...byExpense.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** Cash balance at an instant: opening balance + all income − all expenses since the opening date. */
export async function balanceAt(masjidId: string, at: Date, m?: { openingBalance: number; openingBalanceDate: Date | null }) {
  const masjid = m ?? await db.masjid.findUniqueOrThrow({ where: { id: masjidId }, select: { openingBalance: true, openingBalanceDate: true } });
  const where = { masjidId, voidedAt: null, date: { lt: at, ...(masjid.openingBalanceDate && { gte: masjid.openingBalanceDate }) } };
  const [inc, exp] = await Promise.all([db.income.aggregate({ where, _sum: { amount: true } }), db.expense.aggregate({ where, _sum: { amount: true } })]);
  return masjid.openingBalance + (inc._sum.amount ?? 0) - (exp._sum.amount ?? 0);
}

/** Financial years that have any data, plus the current one, newest first. */
export async function availableFYs(masjidId: string) {
  const [i, e] = await Promise.all([
    db.income.aggregate({ where: { masjidId, voidedAt: null }, _min: { date: true } }),
    db.expense.aggregate({ where: { masjidId, voidedAt: null }, _min: { date: true } }),
  ]);
  const current = fyOf(new Date());
  const first = Math.min(current, ...[i._min.date, e._min.date].filter((d): d is Date => !!d).map(fyOf));
  return Array.from({ length: current - first + 1 }, (_, k) => current - k);
}
