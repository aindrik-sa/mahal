"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FieldType, FormCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str } from "@/lib/format";
import { FORM_CATEGORY_LABEL, FIELD_TYPE_LABEL, CHOICE_TYPES } from "@/lib/applications";
import type { ActionResult } from "@/components/action-form";

const own = (masjidId: string, id: string) =>
  db.form.findFirst({ where: { id, masjidId }, include: { fields: { orderBy: { position: "asc" } } } });
const refresh = (id: string) => { revalidatePath(`/admin/forms/${id}`); revalidatePath("/admin/forms"); revalidatePath("/applications"); };

export async function createForm(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const name = str(fd, "name");
  const category = String(fd.get("category")) as FormCategory;
  if (!name) return { error: "Form name is required." };
  if (!(category in FORM_CATEGORY_LABEL)) return { error: "Choose a category." };
  const form = await db.form.create({ data: { masjidId: user.masjidId, name, category, description: str(fd, "description") } });
  await audit(user, "form.create", "Form", form.id, `Created application form "${name}"`);
  redirect(`/admin/forms/${form.id}`);
}

export async function updateForm(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const form = await own(user.masjidId, String(fd.get("id")));
  if (!form) return { error: "Form not found" };
  const name = str(fd, "name");
  const category = String(fd.get("category")) as FormCategory;
  if (!name) return { error: "Form name is required." };
  if (!(category in FORM_CATEGORY_LABEL)) return { error: "Choose a category." };
  const isActive = fd.get("isActive") === "on";
  if (isActive && !form.fields.length) return { error: "Add at least one field before activating the form." };
  await db.form.update({ where: { id: form.id }, data: { name, category, description: str(fd, "description"), certificateTemplate: str(fd, "certificateTemplate"), isActive } });
  await audit(user, "form.update", "Form", form.id, `Updated form "${name}"${isActive !== form.isActive ? (isActive ? " (activated)" : " (deactivated)") : ""}`);
  refresh(form.id);
  return { ok: "Form saved." };
}

export async function saveField(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const form = await own(user.masjidId, String(fd.get("formId")));
  if (!form) return { error: "Form not found" };
  const label = str(fd, "label");
  const type = String(fd.get("type")) as FieldType;
  if (!label) return { error: "Field label is required." };
  if (!(type in FIELD_TYPE_LABEL)) return { error: "Choose a field type." };
  const options = CHOICE_TYPES.includes(type) ? [...new Set((str(fd, "options") ?? "").split("\n").map((o) => o.trim()).filter(Boolean))] : [];
  if (CHOICE_TYPES.includes(type) && options.length < (type === "CHECKBOX" ? 1 : 2)) return { error: "Enter the choices, one per line." };
  const data = { label, type, options, required: fd.get("required") === "on", helpText: str(fd, "helpText") };
  const id = str(fd, "id");
  if (id) {
    if (!form.fields.some((f) => f.id === id)) return { error: "Field not found" };
    await db.formField.update({ where: { id }, data });
  } else {
    await db.formField.create({ data: { ...data, formId: form.id, position: (form.fields.at(-1)?.position ?? 0) + 1 } });
  }
  await audit(user, id ? "form.field_update" : "form.field_add", "Form", form.id, `${id ? "Updated" : "Added"} field "${label}" on "${form.name}"`);
  refresh(form.id);
  return { ok: id ? "Field saved." : "Field added." };
}

export async function moveField(fd: FormData) {
  const user = await requireAdmin();
  const form = await own(user.masjidId, String(fd.get("formId")));
  if (!form) return;
  const i = form.fields.findIndex((f) => f.id === fd.get("id"));
  const j = i + (fd.get("dir") === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= form.fields.length) return;
  await db.$transaction([
    db.formField.update({ where: { id: form.fields[i].id }, data: { position: form.fields[j].position } }),
    db.formField.update({ where: { id: form.fields[j].id }, data: { position: form.fields[i].position } }),
  ]);
  refresh(form.id);
}

/** Deleting a field is safe for existing applications: they keep a snapshot of the fields they were submitted with. */
export async function deleteField(fd: FormData) {
  const user = await requireAdmin();
  const form = await own(user.masjidId, String(fd.get("formId")));
  const field = form?.fields.find((f) => f.id === fd.get("id"));
  if (!form || !field) return;
  await db.formField.delete({ where: { id: field.id } });
  await audit(user, "form.field_delete", "Form", form.id, `Removed field "${field.label}" from "${form.name}"`);
  refresh(form.id);
}
