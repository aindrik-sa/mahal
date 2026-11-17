import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rupees } from "@/lib/billing";
import { financeSummary, fyOf, fyRange, fyLabel, FY_MONTHS, monthName, balanceAt, INCOME_CATEGORY_LABEL, EXPENSE_CATEGORY_LABEL } from "@/lib/finance";
import { fmtDate } from "@/lib/format";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { MonthlyChart, CategoryBars } from "@/components/finance-chart";

/**
 * Residents see only approved figures: up to the month the admin has published.
 * Never shown: donor names, references, receipts, vendor details, individual income entries.
 */
export default async function ResidentFinancePage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const user = await requireUser();
  const masjid = await db.masjid.findUniqueOrThrow({ where: { id: user.masjidId }, select: { financePublishedThrough: true } });
  const through = masjid.financePublishedThrough;
  if (!through) return <><PageHeader title="Finance" /><div className="card"><Empty>The committee hasn&apos;t published a financial summary yet.</Empty></div></>;

  const lastDay = new Date(through.getTime() - 864e5);
  const latestFy = fyOf(lastDay);
  const req = Number((await searchParams).fy);
  const fy = Number.isInteger(req) && req <= latestFy && req >= latestFy - 5 ? req : latestFy;
  const r = fyRange(fy);
  const range = { from: r.from, to: r.to < through ? r.to : through };
  const [s, balance, expenses] = await Promise.all([
    financeSummary(user.masjidId, range),
    balanceAt(user.masjidId, range.to),
    db.expense.findMany({
      where: { masjidId: user.masjidId, voidedAt: null, date: { gte: range.from, lt: range.to } },
      orderBy: { date: "desc" }, take: 25, select: { id: true, date: true, category: true, description: true, amount: true },
    }),
  ]);
  const months = FY_MONTHS(fy).filter(({ y, m }) => Date.UTC(y, m, 1) < range.to.getTime());
  const chart = months.map(({ y, m }) => ({ label: monthName(m, y), ...s.monthly(y, m) }));

  return (
    <>
      <PageHeader title="Finance" subtitle={`${fyLabel(fy)} · figures published through ${fmtDate(lastDay)}`}
        actions={<form className="flex gap-2">
          <select name="fy" defaultValue={fy} className="input">{Array.from({ length: 3 }, (_, k) => latestFy - k).map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}</select>
          <button className="btn-outline">Go</button>
        </form>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Total income" value={rupees(s.totalIncome)} />
        <Stat label="Total expenses" value={rupees(s.totalExpense)} />
        <Stat label="Net" value={rupees(s.net)} />
        <Stat label="Balance" value={rupees(balance)} hint={`as of ${fmtDate(new Date(range.to.getTime() - 864e5))}`} />
      </div>
      {chart.length > 0 && <div className="mb-4"><MonthlyChart data={chart} title="Monthly income and expenses" /></div>}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <CategoryBars title="Income by category" color="income" rows={s.byIncome.map(([k, v]) => ({ label: INCOME_CATEGORY_LABEL[k], value: v }))} />
        <CategoryBars title="Expenses by category" color="expense" rows={s.byExpense.map(([k, v]) => ({ label: EXPENSE_CATEGORY_LABEL[k], value: v }))} />
      </div>
      <section>
        <h2 className="font-semibold mb-2">Recent expenses</h2>
        <div className="card p-0 overflow-x-auto">
          {expenses.length === 0 ? <Empty>No expenses in this period.</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{expenses.map((e) => (
                <tr key={e.id}><td className="whitespace-nowrap">{fmtDate(e.date)}</td><td>{EXPENSE_CATEGORY_LABEL[e.category]}</td><td>{e.description}</td><td className="text-right tabular-nums">{rupees(e.amount)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
