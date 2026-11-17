import "server-only";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { db } from "./db";
import { allocate, settlePayment } from "./billing";

/** Unpaid installments for a family, with amounts already claimed by unverified payments. */
export async function openInvoices(masjidId: string, familyId: string, invoiceIds?: string[]) {
  const invs = await db.subscriptionInvoice.findMany({
    where: { masjidId, familyId, status: { in: ["PENDING", "PARTIAL"] }, ...(invoiceIds?.length && { id: { in: invoiceIds } }) },
    include: { allocations: { where: { payment: { status: "PENDING_VERIFICATION" } }, select: { amount: true } } },
    orderBy: { periodMonth: "asc" },
  });
  return invs.map((i) => ({ ...i, pendingAllocated: i.allocations.reduce((s, a) => s + a.amount, 0) }));
}

export type NewPayment = {
  masjidId: string; familyId: string; amount: number; method: PaymentMethod; reference: string | null;
  paidOn: Date; notes: string | null; submittedById: string; invoiceIds?: string[];
  /** Admin-recorded payments are verified immediately. */
  verifyAs?: string;
};

/**
 * Creates a payment and its allocations. Runs serializable so two submissions can't claim the same installment.
 * Returns an error string or the payment.
 */
export async function createPayment(p: NewPayment) {
  if (!Number.isInteger(p.amount) || p.amount <= 0) return { error: "Enter a whole rupee amount greater than zero." };
  try {
    return await db.$transaction(async (tx) => {
      if (p.reference) {
        const dup = await tx.payment.findFirst({ where: { masjidId: p.masjidId, reference: p.reference } });
        if (dup) return { error: `Reference ${p.reference} has already been used (${dup.receiptNo ?? "awaiting verification"}).` };
      }
      const invs = await tx.subscriptionInvoice.findMany({
        where: { masjidId: p.masjidId, familyId: p.familyId, status: { in: ["PENDING", "PARTIAL"] }, ...(p.invoiceIds?.length && { id: { in: p.invoiceIds } }) },
        include: { allocations: { where: { payment: { status: "PENDING_VERIFICATION" } }, select: { amount: true } } },
      });
      const withPending = invs.map((i) => ({ ...i, pendingAllocated: i.allocations.reduce((s, a) => s + a.amount, 0) }));
      const plan = allocate(withPending, p.amount);
      if (!plan) return { error: "That amount is more than what is owed on the selected installments." };
      if (!plan.length) return { error: "Nothing is owed on the selected installments." };
      const payment = await tx.payment.create({
        data: {
          masjidId: p.masjidId, familyId: p.familyId, amount: p.amount, method: p.method, reference: p.reference, paidOn: p.paidOn,
          notes: p.notes, submittedById: p.submittedById, allocations: { create: plan },
        },
      });
      if (p.verifyAs) return { payment: await settlePayment(tx, payment.id, p.verifyAs) };
      return { payment };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034"))
      return { error: "This payment conflicts with another one just submitted (same reference or installment). Refresh and try again." };
    throw e;
  }
}
