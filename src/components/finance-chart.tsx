"use client";
import { useState } from "react";

// Validated default categorical pair (slot 1 blue, slot 2 orange) on a light surface.
const INCOME = "#2a78d6";
const EXPENSE = "#eb6834";

export type MonthPoint = { label: string; income: number; expense: number };
const fmt = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN")}`;

/** Grouped monthly bars (income vs expense) with hover tooltip, legend and a table view. */
export function MonthlyChart({ data, title }: { data: MonthPoint[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  // Round the axis top to a tidy number.
  const mag = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / mag) * mag;
  const ticks = [0, top / 2, top];
  const H = 180;

  return (
    <figure className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <figcaption className="font-semibold">{title}</figcaption>
        <div className="flex gap-4 text-xs text-stone-600" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: INCOME }} />Income</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: EXPENSE }} />Expenses</span>
        </div>
      </div>
      <div className="relative" style={{ height: H + 24 }}>
        {/* recessive gridlines + y labels */}
        {ticks.map((t) => (
          <div key={t} className="absolute left-0 right-0 flex items-center gap-2" style={{ bottom: 24 + (t / top) * H - 6 }}>
            <span className="w-14 text-right text-[10px] text-stone-400 tabular-nums">{t >= 1000 ? `${t / 1000}k` : t}</span>
            <div className="flex-1 border-t border-stone-100" />
          </div>
        ))}
        <div className="absolute left-16 right-0 bottom-0 flex items-end" style={{ top: 0 }}>
          {data.map((d, i) => (
            <div key={d.label} className="relative flex-1 h-full flex flex-col justify-end items-center"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
              aria-label={`${d.label}: income ${fmt(d.income)}, expenses ${fmt(d.expense)}`}>
              <div className={`absolute inset-x-0.5 top-0 bottom-6 rounded ${hover === i ? "bg-stone-100" : ""}`} />
              <div className="relative flex items-end gap-[2px]" style={{ height: H }}>
                {[{ v: d.income, c: INCOME }, { v: d.expense, c: EXPENSE }].map((b, k) => (
                  <div key={k} className="w-2.5 sm:w-3.5 rounded-t" style={{ height: b.v ? Math.max(2, (b.v / top) * H) : 0, background: b.c }} />
                ))}
              </div>
              <div className="relative h-6 pt-1 text-[10px] text-stone-500 whitespace-nowrap">{d.label}</div>
              {hover === i && (
                <div className={`absolute z-10 bottom-full mb-1 w-40 rounded-lg border border-stone-200 bg-white p-2 text-xs shadow-lg ${i > data.length - 4 ? "right-0" : i < 3 ? "left-0" : "left-1/2 -translate-x-1/2"}`}>
                  <div className="font-semibold text-stone-900 mb-1">{d.label}</div>
                  <div className="flex justify-between"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: INCOME }} />Income</span><span className="tabular-nums text-stone-900">{fmt(d.income)}</span></div>
                  <div className="flex justify-between"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: EXPENSE }} />Expenses</span><span className="tabular-nums text-stone-900">{fmt(d.expense)}</span></div>
                  <div className="flex justify-between border-t border-stone-100 mt-1 pt-1 text-stone-600"><span>Net</span><span className="tabular-nums">{fmt(d.income - d.expense)}</span></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-emerald-800">Show as table</summary>
        <table className="table mt-2">
          <thead><tr><th>Month</th><th className="text-right">Income</th><th className="text-right">Expenses</th><th className="text-right">Net</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="text-right tabular-nums">{fmt(d.income)}</td><td className="text-right tabular-nums">{fmt(d.expense)}</td><td className="text-right tabular-nums">{fmt(d.income - d.expense)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal category breakdown: single series, so one hue and no legend. */
export function CategoryBars({ title, rows, color }: { title: string; rows: { label: string; value: number }[]; color: "income" | "expense" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="card">
      <div className="font-semibold mb-3">{title}</div>
      {rows.length === 0 ? <p className="text-sm text-stone-500">No entries.</p> : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.label} title={`${r.label}: ${fmt(r.value)} (${Math.round((r.value / total) * 100)}%)`}>
              <div className="flex justify-between gap-2"><span className="text-stone-700">{r.label}</span><span className="tabular-nums text-stone-900">{fmt(r.value)}</span></div>
              <div className="h-2 rounded bg-stone-100 mt-1"><div className="h-2 rounded" style={{ width: `${(r.value / max) * 100}%`, background: color === "income" ? INCOME : EXPENSE }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
