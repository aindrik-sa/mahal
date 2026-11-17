"use server";
import { revalidatePath } from "next/cache";
import type { ExpenseCategory, FinanceMethod, IncomeCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str } from "@/lib/format";
import { storeUpload } from "@/lib/storage";
import { INCOME_CATEGORY_LABEL, EXPENSE_CATEGORY_LABEL, FINANCE_METHOD_LABEL, nextTxnCode, istDay, istYmd } from "@/lib/finance";
import type { ActionResult } from "@/components/action-form";

function common(fd: FormData) {
  const amount = Number(fd.get("amount"));
  const dateStr = str(fd, "date");
  const method = String(fd.get("method")) as FinanceMethod;
  const description = str(fd, "description");
  if (!Number.isInteger(amount) || amount <= 0) return { error: "Enter a whole rupee amount greater than zero." };
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: "Choose the date." };
  if (dateStr > istYmd(new Date())) return { error: "Date can't be in the future." };
  if (!(method in FINANCE_METHOD_LABEL)) return { error: "Choose the payment method." };
  if (!description) return { error: "Description is required." };
  return { amount, date: istDay(dateStr), method, description, reference: str(fd, "reference") };
}

async function attach(fd: FormData, masjidId: string, userId: string) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { id: null as string | null };
  const r = await storeUpload(file, { masjidId, uploadedById: userId, kind: "RECEIPT" });
  return "error" in r ? { error: r.error } : { id: r.file.id };
}

export async function addIncome(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const c = common(fd);
  if ("error" in c) return { error: c.error };
  const category = String(fd.get("category")) as IncomeCategory;
  if (!(category in INCOME_CATEGORY_LABEL) || category === "SUBSCRIPTION")
    return { error: category === "SUBSCRIPTION" ? "Subscription income is recorded automatically from verified payments." : "Choose a category." };
  const a = await attach(fd, user.masjidId, user.id);
  if ("error" in a) return { error: a.error };
  const row = await db.$transaction(async (tx) => tx.income.create({
    data: { ...c, category, masjidId: user.masjidId, txnCode: await nextTxnCode(tx, user.masjidId, "income"), donorName: str(fd, "donorName"), attachmentId: a.id, recordedById: user.id },
  }));
  await audit(user, "income.create", "Income", row.id, `Recorded income ${row.txnCode}: ₹${row.amount} (${INCOME_CATEGORY_LABEL[category]})`);
  revalidatePath("/admin/finance", "layout");
  return { ok: `Recorded ${row.txnCode}.` };
}

export async function addExpense(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const c = common(fd);
  if ("error" in c) return { error: c.error };
  const category = String(fd.get("category")) as ExpenseCategory;
  if (!(category in EXPENSE_CATEGORY_LABEL)) return { error: "Choose a category." };
  const a = await attach(fd, user.masjidId, user.id);
  if ("error" in a) return { error: a.error };
  const row = await db.$transaction(async (tx) => tx.expense.create({
    data: { ...c, category, masjidId: user.masjidId, txnCode: await nextTxnCode(tx, user.masjidId, "expense"), recipient: str(fd, "recipient"), approvedBy: str(fd, "approvedBy"), receiptId: a.id, recordedById: user.id },
  }));
  await audit(user, "expense.create", "Expense", row.id, `Recorded expense ${row.txnCode}: ₹${row.amount} (${EXPENSE_CATEGORY_LABEL[category]})`);
  revalidatePath("/admin/finance", "layout");
  return { ok: `Recorded ${row.txnCode}.` };
}

/** Records are never deleted; voiding keeps them in the ledger (excluded from totals) with a reason. */
export async function voidEntry(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const kind = fd.get("kind") === "expense" ? "expense" : "income";
  const id = String(fd.get("id"));
  const reason = str(fd, "reason");
  if (!reason) return { error: "Give a reason for voiding." };
  if (kind === "income") {
    const row = await db.income.findFirst({ where: { id, masjidId: user.masjidId, voidedAt: null } });
    if (!row) return { error: "Entry not found or already voided." };
    if (row.paymentId) return { error: "This income comes from a verified subscription payment and can't be voided here." };
    await db.income.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    await audit(user, "income.void", "Income", id, `Voided income ${row.txnCode} (₹${row.amount}): ${reason}`);
  } else {
    const row = await db.expense.findFirst({ where: { id, masjidId: user.masjidId, voidedAt: null } });
    if (!row) return { error: "Entry not found or already voided." };
    await db.expense.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    await audit(user, "expense.void", "Expense", id, `Voided expense ${row.txnCode} (₹${row.amount}): ${reason}`);
  }
  revalidatePath("/admin/finance", "layout");
  return { ok: "Voided." };
}

export async function saveFinanceSettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const opening = Number(fd.get("openingBalance") || 0);
  if (!Number.isInteger(opening)) return { error: "Opening balance must be whole rupees." };
  const d = str(fd, "openingBalanceDate");
  await db.masjid.update({ where: { id: user.masjidId }, data: { openingBalance: opening, openingBalanceDate: d ? istDay(d) : null } });
  await audit(user, "finance.settings", "Masjid", user.masjidId, `Set opening balance ₹${opening}${d ? ` as of ${d}` : ""}`);
  revalidatePath("/admin/finance", "layout");
  return { ok: "Saved." };
}

/** Publishes figures to residents up to the end of the chosen month. */
export async function publishThrough(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const month = str(fd, "month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a month." };
  const [y, m] = month.split("-").map(Number);
  const end = istDay(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`);
  if (end > new Date(Date.now() + 31 * 864e5)) return { error: "Can't publish a month that hasn't happened yet." };
  await db.masjid.update({ where: { id: user.masjidId }, data: { financePublishedThrough: end } });
  await audit(user, "finance.publish", "Masjid", user.masjidId, `Published financial summary through ${month}`);
  revalidatePath("/admin/finance", "layout");
  revalidatePath("/finance");
  return { ok: `Residents can now see figures through ${month}.` };
}
