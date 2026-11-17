import { requireAdmin } from "@/lib/auth";
import { Certificate } from "@/components/certificate";

export default async function AdminCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  return <Certificate applicationId={id} masjidId={user.masjidId} />;
}
