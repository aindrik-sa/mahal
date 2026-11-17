import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FORM_CATEGORY_LABEL } from "@/lib/applications";
import { PageHeader } from "@/components/ui";
import { ApplicationForm } from "../../application-form";

export default async function NewApplicationPage({ params }: { params: Promise<{ formId: string }> }) {
  const user = await requireUser();
  const { formId } = await params;
  const form = await db.form.findFirst({ where: { id: formId, masjidId: user.masjidId, isActive: true }, include: { fields: { orderBy: { position: "asc" } } } });
  if (!form) notFound();
  return (
    <>
      <PageHeader title={form.name} subtitle={FORM_CATEGORY_LABEL[form.category]} actions={<Link href="/applications" className="btn-outline">Cancel</Link>} />
      {form.description && <div className="card mb-4 text-sm text-stone-700 whitespace-pre-line">{form.description}</div>}
      <div className="max-w-3xl"><ApplicationForm formId={form.id} fields={form.fields} answers={{}} files={[]} /></div>
    </>
  );
}
