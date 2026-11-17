"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, dateOrNull } from "@/lib/format";
import { settlePayment, rupees, METHOD_LABEL } from "@/lib/billing";
import { createPayment } from "@/lib/payments";
import type { ActionResult } from "@/components/action-form";
import type { PaymentMethod } from "@prisma/client";

const METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "UPI_MANUAL"];

/** Admin records a cash / bank / UPI payment received at the office. Verified immediately. */
export async function recordPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const familyId = String(fd.get("familyId"));
  const fam = await db.family.findFirst({ where: { id: familyId, masjidId: user.masjidId } });
  if (!fam) return { error: "Family not found" };
  const method = String(fd.get("method")) as PaymentMethod;
  if (!METHODS.includes(method)) return { error: "Choose a payment method." };
  const reference = str(fd, "reference");
  if (method !== "CASH" && !reference) return { error: "Enter the transaction reference for UPI or bank payments." };
  const paidOn = dateOrNull(fd, "paidOn") ?? new Date();
  if (paidOn > new Date()) return { error: "Payment date can't be in the future." };
  const r = await createPayment({
    masjidId: user.masjidId, familyId, amount: Number(fd.get("amount")), method, reference, paidOn, notes: str(fd, "notes"),
    submittedById: user.id, invoiceIds: fd.getAll("invoiceIds").map(String), verifyAs: user.id,
  });
  if ("error" in r) return { error: r.error };
  await audit(user, "payment.record", "Payment", r.payment.id, `Recorded ${METHOD_LABEL[method]} payment ${rupees(r.payment.amount)} from ${fam.familyName} (${r.payment.receiptNo})`);
  revalidatePath(`/admin/subscriptions/family/${familyId}`);
  revalidatePath("/admin/payments");
  return { ok: `Payment recorded. Receipt ${r.payment.receiptNo}.` };
}

export async function verifyPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = await db.payment.findFirst({ where: { id: String(fd.get("id")), masjidId: user.masjidId }, include: { family: true } });
  if (!p) return { error: "Payment not found" };
  if (p.status !== "PENDING_VERIFICATION") return { error: "This payment was already processed." };
  try {
    const done = await db.$transaction((tx) => settlePayment(tx, p.id, user.id));
    await audit(user, "payment.verify", "Payment", p.id, `Verified ${rupees(p.amount)} UPI payment from ${p.family.familyName} (ref ${p.reference}, ${done.receiptNo})`);
  } catch {
    return { error: "This payment was already processed." };
  }
  revalidatePath("/admin/payments");
  return { ok: "Verified." };
}

export async function rejectPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const reason = str(fd, "reason");
  if (!reason) return { error: "Give a reason so the resident knows what to fix." };
  const p = await db.payment.findFirst({ where: { id: String(fd.get("id")), masjidId: user.masjidId }, include: { family: true } });
  if (!p) return { error: "Payment not found" };
  // Conditional update guards against a concurrent verify.
  const r = await db.payment.updateMany({
    where: { id: p.id, status: "PENDING_VERIFICATION" },
    // Free the reference so the resident can resubmit if it was a typo.
    data: { status: "REJECTED", rejectReason: reason, verifiedById: user.id, verifiedAt: new Date(), reference: null,
      notes: [p.notes, p.reference && `Submitted reference: ${p.reference}`].filter(Boolean).join("\n") || null },
  });
  if (!r.count) return { error: "This payment was already processed." };
  await audit(user, "payment.reject", "Payment", p.id, `Rejected ${rupees(p.amount)} payment from ${p.family.familyName} (ref ${p.reference}): ${reason}`);
  revalidatePath("/admin/payments");
  return { ok: "Rejected." };
}
