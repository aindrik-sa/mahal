import { requireAdmin } from "@/lib/auth";
import { Receipt } from "@/components/receipt";

export default async function AdminReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  return <Receipt paymentId={id} masjidId={user.masjidId} />;
}
