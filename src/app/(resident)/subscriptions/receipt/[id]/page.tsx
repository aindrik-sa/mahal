import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Receipt } from "@/components/receipt";

export default async function ResidentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  // Residents may only open receipts for their own family.
  const member = user.memberId ? await db.member.findUnique({ where: { id: user.memberId }, select: { familyId: true } }) : null;
  const own = member && (await db.payment.findFirst({ where: { id, masjidId: user.masjidId, familyId: member.familyId }, select: { id: true } }));
  if (!own) notFound();
  return <Receipt paymentId={id} masjidId={user.masjidId} />;
}
