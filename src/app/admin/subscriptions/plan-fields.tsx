import type { SubscriptionPlan } from "@prisma/client";

export function PlanFields({ p, locked }: { p?: SubscriptionPlan; locked?: boolean }) {
  const now = new Date();
  // Default: Indian financial year starting April.
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const lockHint = locked ? " (locked)" : "";
  return (
    <>
      <label className="field"><span>Plan name *</span><input name="name" defaultValue={p?.name ?? `FY ${fyStart}-${String(fyStart + 1).slice(2)}`} required /></label>
      <label className="field"><span>Start month *{lockHint}</span>
        <input name="startMonth" type="month" defaultValue={p ? p.startMonth.toISOString().slice(0, 7) : `${fyStart}-04`} readOnly={locked} required />
      </label>
      <label className="field"><span>Number of months{lockHint}</span><input name="months" type="number" min={1} max={24} defaultValue={p?.months ?? 12} readOnly={locked} /></label>
      <label className="field"><span>Annual amount (₹) *</span><input name="annualAmount" type="number" min={1} defaultValue={p?.annualAmount ?? 1200} required /></label>
      <label className="field"><span>Monthly installment (₹) *{lockHint}</span><input name="monthlyAmount" type="number" min={1} defaultValue={p?.monthlyAmount ?? 100} readOnly={locked} required /></label>
      <label className="field"><span>Due day of month{lockHint}</span><input name="dueDay" type="number" min={1} max={28} defaultValue={p?.dueDay ?? 10} readOnly={locked} /></label>
      <label className="field"><span>Grace period (days)</span><input name="graceDays" type="number" min={0} max={60} defaultValue={p?.graceDays ?? 5} /></label>
      <label className="field"><span>Late fee per installment (₹, 0 = none)</span><input name="lateFee" type="number" min={0} defaultValue={p?.lateFee ?? 0} /></label>
      <label className="field"><span>Masjid UPI ID</span><input name="upiId" placeholder="masjid@okaxis" defaultValue={p?.upiId ?? ""} /></label>
      <label className="field"><span>UPI payee name</span><input name="upiName" placeholder="Juma Masjid Committee" defaultValue={p?.upiName ?? ""} /></label>
    </>
  );
}
