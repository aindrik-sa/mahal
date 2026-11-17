import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Certificate } from "@/components/certificate";

export default async function ResidentCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const own = await db.application.findFirst({ where: { id, masjidId: user.masjidId, applicantId: user.id }, select: { id: true } });
  if (!own) notFound();
  return <Certificate applicationId={id} masjidId={user.masjidId} />;
}
