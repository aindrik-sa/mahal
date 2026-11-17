"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, dateOrNull } from "@/lib/format";
import { rupees } from "@/lib/billing";
import { createPayment } from "@/lib/payments";
import { notifyFamily } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";

/** Resident submits a UPI payment they made, for admin verification. Only for their own family. */
export async function submitUpiPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const member = user.memberId ? await db.member.findFirst({ where: { id: user.memberId, masjidId: user.masjidId }, include: { family: true } }) : null;
  if (!member) return { error: "Your account isn't linked to a family." };
  const invoiceIds = fd.getAll("invoiceIds").map(String);
  if (!invoiceIds.length) return { error: "Tick the installments you paid for." };
  const reference = str(fd, "reference")?.replace(/\s+/g, "") ?? null;
  if (!reference || !/^[A-Za-z0-9]{6,35}$/.test(reference)) return { error: "Enter the UPI transaction ID / UTR from your payment app (letters and numbers, usually 12 digits)." };
  const paidOn = dateOrNull(fd, "paidOn") ?? new Date();
  if (paidOn > new Date()) return { error: "Payment date can't be in the future." };

  // The amount is the full outstanding of the ticked installments, computed on the server.
  const invs = await db.subscriptionInvoice.findMany({
    where: { id: { in: invoiceIds }, masjidId: user.masjidId, familyId: member.familyId, status: { in: ["PENDING", "PARTIAL"] } },
    include: { allocations: { where: { payment: { status: "PENDING_VERIFICATION" } }, select: { amount: true } } },
  });
  const amount = invs.reduce((s, i) => s + i.amount + i.lateFee - i.paidAmount - i.allocations.reduce((t, a) => t + a.amount, 0), 0);
  if (invs.length !== invoiceIds.length || amount <= 0) return { error: "Some installments are already paid or awaiting verification. Refresh the page." };

  const r = await createPayment({
    masjidId: user.masjidId, familyId: member.familyId, amount, method: "UPI_MANUAL", reference, paidOn,
    notes: str(fd, "notes"), submittedById: user.id, invoiceIds,
  });
  if ("error" in r) return { error: r.error };
  await notifyFamily(user.masjidId, member.familyId, { title: "Payment verification pending", body: `Your UPI payment of ${rupees(amount)} (ref ${reference}) was submitted and is awaiting verification by the Mahall office.`, category: "PAYMENT" });
  await audit(user, "payment.submit", "Payment", r.payment.id, `${user.name} submitted UPI payment ${rupees(amount)} (ref ${reference}) for ${member.family.familyName}`);
  revalidatePath("/subscriptions");
  return { ok: `Submitted ${rupees(amount)}. The Mahall office will verify it and your receipt will appear here.` };
}
