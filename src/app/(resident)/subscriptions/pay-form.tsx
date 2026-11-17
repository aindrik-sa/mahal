"use client";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ActionForm } from "@/components/action-form";
import { submitUpiPayment } from "./actions";

type Open = { id: string; label: string; owed: number; overdue: boolean; due: boolean };

export function PayForm({ open, upiId, upiName, familyCode, today }: { open: Open[]; upiId: string | null; upiName: string | null; familyCode: string; today: string }) {
  // Pre-select everything that is due or overdue; otherwise the next installment.
  const initial = open.filter((o) => o.due).map((o) => o.id);
  const [sel, setSel] = useState<string[]>(initial.length ? initial : open.slice(0, 1).map((o) => o.id));
  const total = open.filter((o) => sel.includes(o.id)).reduce((s, o) => s + o.owed, 0);
  const months = open.filter((o) => sel.includes(o.id)).map((o) => o.label).join(", ");
  const upiLink = useMemo(() => {
    if (!upiId || !total) return null;
    const p = new URLSearchParams({ pa: upiId, pn: upiName ?? "Masjid", am: String(total), cu: "INR", tn: `Subscription ${familyCode} ${months}`.slice(0, 80) });
    return `upi://pay?${p.toString()}`;
  }, [upiId, upiName, total, familyCode, months]);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!upiLink) { setQr(null); return; }
    QRCode.toDataURL(upiLink, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [upiLink]);

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ActionForm action={submitUpiPayment} className="card grid gap-4" submit="Submit payment for verification" pendingLabel="Submitting…">
      <fieldset>
        <legend className="text-sm font-medium mb-2">1. Choose installments</legend>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {open.map((o) => (
            <label key={o.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${sel.includes(o.id) ? "border-emerald-500 bg-emerald-50" : "border-stone-200"}`}>
              <input type="checkbox" name="invoiceIds" value={o.id} checked={sel.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="flex-1">{o.label}</span>
              <span className="font-medium">₹{o.owed}</span>
              {o.overdue && <span className="badge bg-red-100 text-red-800">Overdue</span>}
            </label>
          ))}
        </div>
        <div className="mt-2 text-sm">Total: <span className="text-lg font-semibold">₹{total.toLocaleString("en-IN")}</span></div>
      </fieldset>

      <div>
        <div className="text-sm font-medium mb-2">2. Pay with any UPI app</div>
        {!upiId ? <p className="text-sm text-stone-600">The masjid hasn&apos;t set a UPI ID yet. Pay at the Mahall office.</p> : total === 0 ? (
          <p className="text-sm text-stone-500">Select at least one installment.</p>
        ) : (
          <div className="flex flex-wrap gap-4 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="UPI QR code" width={160} height={160} className="rounded-lg border border-stone-200" />}
            <div className="text-sm space-y-2">
              <div>Pay <b>₹{total.toLocaleString("en-IN")}</b> to <span className="font-mono">{upiId}</span>{upiName && <> ({upiName})</>}</div>
              {upiLink && <a href={upiLink} className="btn">Open UPI app</a>}
              <p className="text-xs text-stone-500">On a phone, tap the button. On a computer, scan the QR with your phone.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="col-span-full text-sm font-medium">3. Enter the transaction details</div>
        <label className="field"><span>UPI transaction ID / UTR *</span><input name="reference" inputMode="text" autoComplete="off" placeholder="e.g. 412345678901" required /></label>
        <label className="field"><span>Payment date</span><input name="paidOn" type="date" defaultValue={today} max={today} /></label>
        <label className="field col-span-full"><span>Note (optional)</span><input name="notes" /></label>
      </div>
    </ActionForm>
  );
}
