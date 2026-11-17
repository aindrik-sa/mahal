import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rupees } from "@/lib/billing";
import { financeSummary, fyOf, fyRange, fyLabel, FY_MONTHS, monthName, availableFYs, balanceAt, INCOME_CATEGORY_LABEL, EXPENSE_CATEGORY_LABEL, istYmd, istYM } from "@/lib/finance";
import { fmtDate } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { MonthlyChart, CategoryBars } from "@/components/finance-chart";
import { saveFinanceSettings, publishThrough } from "./actions";

export default async function FinanceOverview({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const fys = await availableFYs(user.masjidId);
  const fy = fys.includes(Number(sp.fy)) ? Number(sp.fy) : fyOf(new Date());
  const range = fyRange(fy);
  const [s, masjid] = await Promise.all([
    financeSummary(user.masjidId, range),
    db.masjid.findUniqueOrThrow({ where: { id: user.masjidId }, select: { openingBalance: true, openingBalanceDate: true, financePublishedThrough: true } }),
  ]);
  const now = new Date();
  const { y: cy, m: cm } = istYM(now);
  const thisMonth = s.monthly(cy, cm);
  const chart = FY_MONTHS(fy).map(({ y, m }) => ({ label: monthName(m, y), ...s.monthly(y, m) }));
  const lastMonth = `${cm === 0 ? cy - 1 : cy}-${String(cm === 0 ? 12 : cm).padStart(2, "0")}`;
  const current = fy === fyOf(now);

  return (
    <>
      <PageHeader title="Income & Expenses" subtitle={`${fyLabel(fy)} · April to March`}
        actions={<>
          <form className="flex gap-2"><select name="fy" defaultValue={fy} className="input">{fys.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}</select><button className="btn-outline">Go</button></form>
          <a href={`/admin/finance/export?type=all&fy=${fy}`} className="btn-outline">Export year (CSV)</a>
        </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Total income" value={rupees(s.totalIncome)} hint={fyLabel(fy)} href={`/admin/finance/income?fy=${fy}`} />
        <Stat label="Total expenses" value={rupees(s.totalExpense)} hint={fyLabel(fy)} href={`/admin/finance/expenses?fy=${fy}`} />
        <Stat label="Net for the year" value={rupees(s.net)} />
        <Stat label={current ? "Current balance" : "Closing balance"} value={rupees(current ? await balanceNow(user.masjidId) : s.balance)} hint={masjid.openingBalanceDate ? `Opening ${rupees(masjid.openingBalance)} on ${fmtDate(masjid.openingBalanceDate)}` : "Set an opening balance below"} />
      </div>
      {current && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label={`Income · ${monthName(cm, cy)}`} value={rupees(thisMonth.income)} />
          <Stat label={`Expenses · ${monthName(cm, cy)}`} value={rupees(thisMonth.expense)} />
        </div>
      )}
      <div className="mb-4"><MonthlyChart data={chart} title={`Monthly income and expenses, ${fyLabel(fy)}`} /></div>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <CategoryBars title="Income by category" color="income" rows={s.byIncome.map(([k, v]) => ({ label: INCOME_CATEGORY_LABEL[k], value: v }))} />
        <CategoryBars title="Expenses by category" color="expense" rows={s.byExpense.map(([k, v]) => ({ label: EXPENSE_CATEGORY_LABEL[k], value: v }))} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section>
          <h2 className="font-semibold mb-2">Publish to residents</h2>
          <ActionForm action={publishThrough} className="card grid gap-3" submit="Publish summary">
            <p className="text-sm text-stone-600">
              Residents see totals, monthly figures, category breakdowns and expense descriptions up to the published month. Donor names, references and receipts are never shown.
              {" "}<b>{masjid.financePublishedThrough ? `Currently published through ${fmtDate(new Date(masjid.financePublishedThrough.getTime() - 864e5))}.` : "Nothing published yet."}</b>
            </p>
            <label className="field"><span>Publish through end of</span><input type="month" name="month" defaultValue={lastMonth} required /></label>
          </ActionForm>
        </section>
        <section>
          <h2 className="font-semibold mb-2">Opening balance</h2>
          <ActionForm action={saveFinanceSettings} className="card grid gap-3 sm:grid-cols-2" submit="Save">
            <label className="field"><span>Opening balance (₹)</span><input name="openingBalance" type="number" defaultValue={masjid.openingBalance} /></label>
            <label className="field"><span>As of date</span><input name="openingBalanceDate" type="date" defaultValue={masjid.openingBalanceDate ? istYmd(masjid.openingBalanceDate) : ""} /></label>
            <p className="sm:col-span-2 text-xs text-stone-500">Cash and bank balance before records in this system began. Entries dated earlier than this are not counted in the balance.</p>
          </ActionForm>
        </section>
      </div>
      <p className="text-xs text-stone-500 mt-4">Subscription payments are added to income automatically when verified. <Link href="/admin/payments" className="text-emerald-800 hover:underline">Payments</Link></p>
    </>
  );
}

/** Balance including everything dated up to today. */
const balanceNow = (masjidId: string) => balanceAt(masjidId, new Date(Date.now() + 864e5));
