import Link from "next/link";
import { notFound } from "next/navigation";
import type { FormField } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { FORM_CATEGORY_LABEL, FIELD_TYPE_LABEL } from "@/lib/applications";
import { PageHeader } from "@/components/ui";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { FormRenderer } from "@/components/form-renderer";
import { updateForm, saveField, moveField, deleteField } from "../actions";

function FieldEditor({ f, formId }: { f?: FormField; formId: string }) {
  return (
    <>
      <input type="hidden" name="formId" value={formId} />
      {f && <input type="hidden" name="id" value={f.id} />}
      <label className="field"><span>Label *</span><input name="label" defaultValue={f?.label} required /></label>
      <label className="field"><span>Type</span>
        <select name="type" defaultValue={f?.type ?? "TEXT"}>{Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="field sm:col-span-2"><span>Choices (dropdown, radio, checkboxes): one per line</span><textarea name="options" rows={2} defaultValue={f?.options.join("\n")} /></label>
      <label className="field sm:col-span-2"><span>Help text / declaration wording</span><input name="helpText" defaultValue={f?.helpText ?? ""} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={f?.required ?? false} /> Required</label>
    </>
  );
}

export default async function FormEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const form = await db.form.findFirst({ where: { id, masjidId: user.masjidId }, include: { fields: { orderBy: { position: "asc" } } } });
  if (!form) notFound();

  return (
    <>
      <PageHeader title={form.name} subtitle={FORM_CATEGORY_LABEL[form.category]} actions={<Link href="/admin/forms" className="btn-outline">All forms</Link>} />
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section>
            <h2 className="font-semibold mb-2">Settings</h2>
            <ActionForm action={updateForm} className="card grid gap-4 sm:grid-cols-2" submit="Save form">
              <input type="hidden" name="id" value={form.id} />
              <label className="field"><span>Name</span><input name="name" defaultValue={form.name} required /></label>
              <label className="field"><span>Category</span>
                <select name="category" defaultValue={form.category}>{Object.entries(FORM_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label className="field sm:col-span-2"><span>Description / instructions for applicants</span><textarea name="description" rows={2} defaultValue={form.description ?? ""} /></label>
              <label className="field sm:col-span-2"><span>Certificate template (optional; used by &quot;Generate certificate&quot;)</span>
                <textarea name="certificateTemplate" rows={5} defaultValue={form.certificateTemplate ?? ""}
                  placeholder={"This is to certify that the marriage of {{Groom's name}} and {{Bride's name}} was solemnised on {{Marriage date}} at {{Marriage location}}…"} />
              </label>
              <p className="sm:col-span-2 text-xs text-stone-500">Placeholders: any field label in double braces, plus {"{{applicant}}, {{family}}, {{certificate_no}}, {{date}}, {{masjid}}"}.</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={form.isActive} /> Active (residents can apply)</label>
            </ActionForm>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Fields ({form.fields.length})</h2>
            <div className="space-y-2 mb-3">
              {form.fields.map((f, i) => (
                <details key={f.id} className="card p-0">
                  <summary className="flex flex-wrap items-center gap-2 px-4 py-2.5 cursor-pointer list-none text-sm">
                    <span className="text-stone-500 w-5">{i + 1}.</span>
                    <span className="font-medium">{f.label}</span>
                    <span className="badge bg-stone-100 text-stone-600">{FIELD_TYPE_LABEL[f.type]}</span>
                    {f.required && <span className="badge bg-amber-100 text-amber-800">Required</span>}
                  </summary>
                  <div className="border-t border-stone-200 p-4 space-y-3">
                    <ActionForm action={saveField} className="grid gap-3 sm:grid-cols-2" submit="Save field"><FieldEditor f={f} formId={form.id} /></ActionForm>
                    <div className="flex gap-2">
                      {i > 0 && <form action={moveField}><input type="hidden" name="formId" value={form.id} /><input type="hidden" name="id" value={f.id} /><input type="hidden" name="dir" value="up" /><button className="btn-outline">Move up</button></form>}
                      {i < form.fields.length - 1 && <form action={moveField}><input type="hidden" name="formId" value={form.id} /><input type="hidden" name="id" value={f.id} /><input type="hidden" name="dir" value="down" /><button className="btn-outline">Move down</button></form>}
                      <form action={deleteField} className="ml-auto"><input type="hidden" name="formId" value={form.id} /><input type="hidden" name="id" value={f.id} /><ConfirmButton className="btn-danger" message={`Remove field "${f.label}"? Submitted applications keep their copy.`}>Remove</ConfirmButton></form>
                    </div>
                  </div>
                </details>
              ))}
            </div>
            <ActionForm action={saveField} resetOnOk className="card grid gap-3 sm:grid-cols-2" submit="Add field">
              <div className="sm:col-span-2 text-sm font-medium">Add field</div>
              <FieldEditor formId={form.id} />
            </ActionForm>
          </section>
        </div>

        <section>
          <h2 className="font-semibold mb-2">Preview</h2>
          <div className="card">
            {form.description && <p className="text-sm text-stone-600 mb-4 whitespace-pre-line">{form.description}</p>}
            <fieldset disabled className="grid gap-4"><FormRenderer fields={form.fields} answers={{}} files={[]} /></fieldset>
          </div>
        </section>
      </div>
    </>
  );
}
