import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { FORM_CATEGORY_LABEL } from "@/lib/applications";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createForm } from "./actions";

export default async function FormsPage() {
  const user = await requireAdmin();
  const forms = await db.form.findMany({
    where: { masjidId: user.masjidId }, orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { fields: true, applications: { where: { status: { not: "DRAFT" } } } } } },
  });
  return (
    <>
      <PageHeader title="Form Builder" subtitle="Application forms residents fill in to request certificates." />
      <section className="mb-6">
        {forms.length === 0 ? <div className="card"><Empty>No forms yet.</Empty></div> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {forms.map((f) => (
              <Link key={f.id} href={`/admin/forms/${f.id}`} className="card hover:border-emerald-400">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{f.name}</span>
                  <span className={`badge ${f.isActive ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{f.isActive ? "Active" : "Inactive"}</span>
                </div>
                <div className="text-sm text-stone-600">{FORM_CATEGORY_LABEL[f.category]}</div>
                <div className="text-xs text-stone-500 mt-1">{f._count.fields} fields · {f._count.applications} applications</div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="font-semibold mb-2">New form</h2>
        <ActionForm action={createForm} className="card grid gap-4 sm:grid-cols-2" submit="Create form">
          <label className="field"><span>Form name *</span><input name="name" required placeholder="e.g. No Objection Certificate" /></label>
          <label className="field"><span>Category *</span>
            <select name="category" defaultValue="OTHER">{Object.entries(FORM_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="field sm:col-span-2"><span>Description / instructions</span><textarea name="description" rows={2} /></label>
        </ActionForm>
      </section>
    </>
  );
}
