import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { rupees } from "@/lib/billing";
import { fyOf, fyRange, fyLabel, availableFYs, INCOME_CATEGORY_LABEL, EXPENSE_CATEGORY_LABEL, FINANCE_METHOD_LABEL, istYmd } from "@/lib/finance";
import { fmtDate } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { addIncome, addExpense, voidEntry } from "./actions";

const PAGE = 50;

/** Shared income / expense ledger page. */
export async function Ledger({ kind, masjidId, sp }: { kind: "income" | "expense"; masjidId: string; sp: Record<string, string | undefined> }) {
  const isIncome = kind === "income";
  const LABEL: Record<string, string> = isIncome ? INCOME_CATEGORY_LABEL : EXPENSE_CATEGORY_LABEL;
  const fys = await availableFYs(masjidId);
  const fy = fys.includes(Number(sp.fy)) ? Number(sp.fy) : fyOf(new Date());
  const { from, to } = fyRange(fy);
  const cat = sp.cat && sp.cat in LABEL ? sp.cat : undefined;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const showVoid = sp.void === "1";
  const where = {
    masjidId, date: { gte: from, lt: to }, ...(cat && { category: cat }), ...(!showVoid && { voidedAt: null }),
    ...(q && { OR: [
      { description: { contains: q, mode: "insensitive" as const } }, { txnCode: { contains: q, mode: "insensitive" as const } }, { reference: { contains: q, mode: "insensitive" as const } },
      isIncome ? { donorName: { contains: q, mode: "insensitive" as const } } : { recipient: { contains: q, mode: "insensitive" as const } },
    ] }),
  };
  const include = { recordedBy: { select: { name: true } }, ...(isIncome ? { attachment: { select: { id: true, originalName: true } } } : { receipt: { select: { id: true, originalName: true } } }) };
  type Row = { id: string; txnCode: string; category: string; description: string; amount: number; date: Date; method: keyof typeof FINANCE_METHOD_LABEL; reference: string | null;
    donorName?: string | null; recipient?: string | null; approvedBy?: string | null; paymentId?: string | null; voidedAt: Date | null; voidReason: string | null;
    recordedBy: { name: string } | null; attachment?: { id: string; originalName: string } | null; receipt?: { id: string; originalName: string } | null };
  const [rows, total, sum] = isIncome
    ? await Promise.all([db.income.findMany({ where: where as Prisma.IncomeWhereInput, include, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
        db.income.count({ where: where as Prisma.IncomeWhereInput }), db.income.aggregate({ where: { ...(where as Prisma.IncomeWhereInput), voidedAt: null }, _sum: { amount: true } })])
    : await Promise.all([db.expense.findMany({ where: where as Prisma.ExpenseWhereInput, include, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
        db.expense.count({ where: where as Prisma.ExpenseWhereInput }), db.expense.aggregate({ where: { ...(where as Prisma.ExpenseWhereInput), voidedAt: null }, _sum: { amount: true } })]);
  const list = rows as unknown as Row[];
  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ fy: String(fy), ...(cat && { cat }), ...(q && { q }), ...(showVoid && { void: "1" }), ...o })}`;
  const categories = Object.entries(LABEL).filter(([k]) => !(isIncome && k === "SUBSCRIPTION"));

  return (
    <>
      <PageHeader title={isIncome ? "Income Management" : "Expense Management"} subtitle={`${fyLabel(fy)} · ${total} entries · total ${rupees(sum._sum.amount ?? 0)}`}
        actions={<a href={`/admin/finance/export?type=${kind}&fy=${fy}`} className="btn-outline">Export CSV</a>} />

      <details className="mb-6" open={total === 0}>
        <summary className="btn cursor-pointer list-none w-fit">{isIncome ? "Record income" : "Record expense"}</summary>
        <ActionForm action={isIncome ? addIncome : addExpense} resetOnOk className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-2" submit="Save">
          <label className="field"><span>Category *</span><select name="category" required defaultValue="">{<option value="" disabled>Select</option>}{categories.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Amount (₹) *</span><input name="amount" type="number" min={1} required /></label>
          <label className="field"><span>Date *</span><input name="date" type="date" defaultValue={istYmd(new Date())} max={istYmd(new Date())} required /></label>
          <label className="field sm:col-span-2 lg:col-span-3"><span>Description *</span><input name="description" required placeholder={isIncome ? "e.g. Friday collection" : "e.g. KSEB bill, October"} /></label>
          <label className="field"><span>Payment method *</span><select name="method" defaultValue="CASH">{Object.entries(FINANCE_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Reference no.</span><input name="reference" /></label>
          {isIncome
            ? <label className="field"><span>Donor name (private)</span><input name="donorName" /></label>
            : <>
                <label className="field"><span>Recipient / vendor</span><input name="recipient" /></label>
                <label className="field"><span>Approved by</span><input name="approvedBy" /></label>
              </>}
          <label className="field"><span>{isIncome ? "Supporting document" : "Receipt"} (PDF/JPG/PNG)</span><input type="file" name="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" /></label>
        </ActionForm>
      </details>

      <form className="flex flex-wrap gap-2 mb-3">
        <select name="fy" defaultValue={fy} className="input">{fys.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}</select>
        <select name="cat" defaultValue={cat ?? ""} className="input"><option value="">All categories</option>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="q" defaultValue={q} placeholder={isIncome ? "Search description, ID, reference, donor" : "Search description, ID, reference, vendor"} className="input flex-1 min-w-48" />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="void" value="1" defaultChecked={showVoid} />Show voided</label>
        <button className="btn-outline">Filter</button>
      </form>

      <div className="card p-0 overflow-x-auto">
        {list.length === 0 ? <Empty>No entries.</Empty> : (
          <table className="table">
            <thead><tr><th>ID</th><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th><th>Method</th><th>{isIncome ? "Donor" : "Vendor"}</th><th>File</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => {
                const file = r.attachment ?? r.receipt;
                return (
                  <tr key={r.id} className={r.voidedAt ? "opacity-50" : ""}>
                    <td className="font-mono text-xs whitespace-nowrap">{r.txnCode}</td>
                    <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="whitespace-nowrap">{LABEL[r.category]}</td>
                    <td>
                      <span className={r.voidedAt ? "line-through" : ""}>{r.description}</span>
                      {r.reference && <span className="block text-xs text-stone-500">Ref {r.reference}</span>}
                      {r.approvedBy && <span className="block text-xs text-stone-500">Approved by {r.approvedBy}</span>}
                      {r.voidedAt && <span className="block text-xs text-red-700">Voided: {r.voidReason}</span>}
                      <span className="block text-xs text-stone-400">Recorded by {r.recordedBy?.name ?? "—"}</span>
                    </td>
                    <td className="text-right font-medium tabular-nums">{rupees(r.amount)}</td>
                    <td>{FINANCE_METHOD_LABEL[r.method]}</td>
                    <td>{(isIncome ? r.donorName : r.recipient) ?? "—"}</td>
                    <td>{file ? <a href={`/files/${file.id}?inline=1`} target="_blank" rel="noopener noreferrer" className="text-emerald-800 hover:underline">View</a> : "—"}</td>
                    <td>
                      {!r.voidedAt && !r.paymentId && (
                        <details>
                          <summary className="text-xs text-red-700 cursor-pointer list-none">Void</summary>
                          <ActionForm action={voidEntry} className="grid gap-1 mt-1 w-48" submit="Confirm void">
                            <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={r.id} />
                            <input name="reason" required placeholder="Reason" className="input" />
                          </ActionForm>
                        </details>
                      )}
                      {r.paymentId && <span className="text-xs text-stone-400">From payment</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        {page > 1 && <Link className="btn-outline" href={qs({ page: String(page - 1) })}>Newer</Link>}
        {page * PAGE < total && <Link className="btn-outline" href={qs({ page: String(page + 1) })}>Older</Link>}
      </div>
    </>
  );
}
