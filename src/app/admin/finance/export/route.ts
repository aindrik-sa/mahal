import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { fyRange, fyLabel, istYmd, INCOME_CATEGORY_LABEL, EXPENSE_CATEGORY_LABEL, FINANCE_METHOD_LABEL } from "@/lib/finance";

/** Financial year report: type=income | expense | all (combined ledger with running totals). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.masjidId || user.role === "RESIDENT") return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const fy = Number(sp.get("fy"));
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) return new Response("Bad fy", { status: 400 });
  const type = sp.get("type") === "income" ? "income" : sp.get("type") === "expense" ? "expense" : "all";
  const { from, to } = fyRange(fy);
  const where = { masjidId: user.masjidId, date: { gte: from, lt: to } };
  const [inc, exp] = await Promise.all([
    type !== "expense" ? db.income.findMany({ where, orderBy: { date: "asc" } }) : [],
    type !== "income" ? db.expense.findMany({ where, orderBy: { date: "asc" } }) : [],
  ]);
  const rows = [
    ...inc.map((i) => ({ d: i.date, r: [i.txnCode, istYmd(i.date), "Income", INCOME_CATEGORY_LABEL[i.category], i.description, i.amount, FINANCE_METHOD_LABEL[i.method], i.reference, i.donorName, "", i.voidedAt ? `VOID: ${i.voidReason}` : ""] })),
    ...exp.map((e) => ({ d: e.date, r: [e.txnCode, istYmd(e.date), "Expense", EXPENSE_CATEGORY_LABEL[e.category], e.description, -e.amount, FINANCE_METHOD_LABEL[e.method], e.reference, e.recipient, e.approvedBy, e.voidedAt ? `VOID: ${e.voidReason}` : ""] })),
  ].sort((a, b) => a.d.getTime() - b.d.getTime()).map((x) => x.r);
  const csv = toCsv([["id", "date", "type", "category", "description", "amount", "method", "reference", "donor_or_vendor", "approved_by", "status"], ...rows]);
  await audit({ id: user.id, masjidId: user.masjidId }, "finance.export", "Masjid", user.masjidId, `Exported ${type} ledger for ${fyLabel(fy)}`);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mahall-${type}-${fyLabel(fy).replace(/\s/g, "")}.csv"` } });
}
