"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storeUpload, removeStored } from "@/lib/storage";
import { readAnswers, validateAnswers, type FieldSnap } from "@/lib/applications";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";

const MAX_FILES_PER_APP = 10;

/** Creates or updates the resident's own application, as a draft or a submission. Handles file uploads. */
export async function saveApplication(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const intent = fd.get("intent") === "submit" ? "submit" : "draft";
  const id = String(fd.get("id") ?? "");

  let app = id
    ? await db.application.findFirst({ where: { id, masjidId: user.masjidId, applicantId: user.id }, include: { files: true, form: { include: { fields: { orderBy: { position: "asc" } } } } } })
    : null;
  if (id && !app) return { error: "Application not found." };
  if (app && !["DRAFT", "INFO_REQUIRED"].includes(app.status)) return { error: "This application can no longer be edited." };

  const form = app?.form ?? await db.form.findFirst({ where: { id: String(fd.get("formId")), masjidId: user.masjidId, isActive: true }, include: { fields: { orderBy: { position: "asc" } } } });
  if (!form) return { error: "This form is not available." };
  if (!app && !form.isActive) return { error: "This form is no longer accepting applications." };
  // Re-submissions after "info required" use the fields the application was first submitted with.
  const fields: FieldSnap[] = app?.status === "INFO_REQUIRED" && app.fieldsSnapshot ? (app.fieldsSnapshot as FieldSnap[]) : form.fields;
  const answers = readAnswers(fields, fd);

  const uploads = fields.filter((f) => f.type === "FILE").flatMap((f) => fd.getAll(`file_${f.id}`).filter((x): x is File => x instanceof File && x.size > 0).map((file) => ({ f, file })));
  if ((app?.files.length ?? 0) + uploads.length > MAX_FILES_PER_APP) return { error: `At most ${MAX_FILES_PER_APP} files per application.` };

  if (!app) {
    const member = user.memberId ? await db.member.findUnique({ where: { id: user.memberId }, select: { familyId: true } }) : null;
    const created = await db.application.create({ data: { masjidId: user.masjidId, formId: form.id, applicantId: user.id, familyId: member?.familyId, answers } });
    app = { ...created, files: [], form };
  } else {
    await db.application.update({ where: { id: app.id }, data: { answers } });
  }

  for (const { f, file } of uploads) {
    const r = await storeUpload(file, { masjidId: user.masjidId, uploadedById: user.id, applicationId: app.id, fieldId: f.id });
    if ("error" in r) { revalidatePath(`/applications/${app.id}`); return { error: `${r.error} Other answers were saved as a draft.` }; }
    app.files.push(r.file);
  }

  if (intent === "draft") {
    revalidatePath(`/applications/${app.id}`);
    if (!id) redirect(`/applications/${app.id}?saved=1`);
    return { ok: "Draft saved." };
  }

  const counts: Record<string, number> = {};
  for (const f of app.files) if (f.fieldId) counts[f.fieldId] = (counts[f.fieldId] ?? 0) + 1;
  const err = validateAnswers(fields, answers, counts);
  if (err) {
    if (!id) redirect(`/applications/${app.id}?error=${encodeURIComponent(err)}`);
    revalidatePath(`/applications/${app.id}`);
    return { error: err };
  }

  const from = app.status;
  const appId = app.id;
  const done = await db.$transaction(async (tx) => {
    let appCode = app!.appCode;
    if (!appCode) {
      const seq = (await tx.masjid.update({ where: { id: user.masjidId }, data: { applicationSeq: { increment: 1 } } })).applicationSeq;
      appCode = `APP-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
    }
    const snapshot = fields.map(({ id, label, type, required, options, helpText }) => ({ id, label, type, required, options, helpText }));
    const a = await tx.application.update({
      where: { id: appId },
      data: { status: "SUBMITTED", appCode, submittedAt: new Date(), fieldsSnapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
    await tx.applicationStatusHistory.create({ data: { applicationId: appId, from, to: "SUBMITTED", byUserId: user.id, note: from === "INFO_REQUIRED" ? "Resubmitted with the requested information." : null } });
    await notify({ masjidId: user.masjidId, title: `Application ${appCode} submitted`, body: `Your ${form.name} application has been received. You will be notified as it is reviewed.`,
      category: "APPLICATION", audience: "DIRECT", userIds: [user.id], automated: true }, tx);
    return a;
  });
  await audit(user, "application.submit", "Application", appId, `${user.name} ${from === "INFO_REQUIRED" ? "resubmitted" : "submitted"} ${done.appCode} (${form.name})`);
  revalidatePath("/applications");
  redirect(`/applications/${appId}?submitted=1`);
}

export async function removeDraftFile(fd: FormData) {
  const user = await requireUser();
  const f = await db.storedFile.findFirst({
    where: { id: String(fd.get("fileId")), masjidId: user.masjidId, kind: "SUPPORTING", application: { applicantId: user.id, status: { in: ["DRAFT", "INFO_REQUIRED"] } } },
  });
  if (!f) return;
  await db.storedFile.delete({ where: { id: f.id } });
  await removeStored(f.storageKey);
  revalidatePath(`/applications/${f.applicationId}`);
}

export async function deleteDraft(fd: FormData) {
  const user = await requireUser();
  const app = await db.application.findFirst({ where: { id: String(fd.get("id")), applicantId: user.id, status: "DRAFT", appCode: null }, include: { files: true } });
  if (!app) return;
  await db.application.delete({ where: { id: app.id } });
  for (const f of app.files) await removeStored(f.storageKey);
  redirect("/applications");
}
