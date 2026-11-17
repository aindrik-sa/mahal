"use server";
import { revalidatePath } from "next/cache";
import type { ApplicationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str } from "@/lib/format";
import { storeUpload } from "@/lib/storage";
import { notify } from "@/lib/notify";
import { ADMIN_TRANSITIONS, APP_STATUS_LABEL } from "@/lib/applications";
import type { ActionResult } from "@/components/action-form";

const NOTE_REQUIRED: ApplicationStatus[] = ["INFO_REQUIRED", "REJECTED"];

const MESSAGE: Partial<Record<ApplicationStatus, string>> = {
  UNDER_REVIEW: "is now under review.",
  INFO_REQUIRED: "needs more information. Open the application to see what is required and resubmit.",
  APPROVED: "has been approved. Your certificate will be issued shortly.",
  REJECTED: "was not approved.",
  CERTIFICATE_READY: "is complete: your certificate is ready to download.",
  COMPLETED: "has been closed.",
};

async function own(masjidId: string, id: string) {
  return db.application.findFirst({ where: { id, masjidId }, include: { form: true, applicant: { select: { id: true, name: true } } } });
}

async function transition(adminId: string, masjidId: string, app: NonNullable<Awaited<ReturnType<typeof own>>>, to: ApplicationStatus, note: string | null, extra: object = {}) {
  // Conditional update: fails if another admin changed the status meanwhile.
  const r = await db.application.updateMany({ where: { id: app.id, status: app.status }, data: { status: to, ...extra } });
  if (!r.count) return false;
  await db.applicationStatusHistory.create({ data: { applicationId: app.id, from: app.status, to, note, byUserId: adminId } });
  await notify({
    masjidId, title: `Application ${app.appCode}: ${APP_STATUS_LABEL[to]}`,
    body: `Your ${app.form.name} application ${MESSAGE[to] ?? ""}${note ? `\n\n${note}` : ""}`,
    category: "APPLICATION", priority: to === "INFO_REQUIRED" || to === "CERTIFICATE_READY" ? "IMPORTANT" : "NORMAL",
    audience: "DIRECT", userIds: [app.applicantId], automated: true,
  });
  return true;
}

export async function changeStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const app = await own(user.masjidId, String(fd.get("id")));
  if (!app) return { error: "Application not found" };
  const to = String(fd.get("to")) as ApplicationStatus;
  if (to === "CERTIFICATE_READY") return { error: "Use the certificate section to issue a certificate." };
  if (!ADMIN_TRANSITIONS[app.status]?.includes(to)) return { error: `Can't move from ${APP_STATUS_LABEL[app.status]} to ${APP_STATUS_LABEL[to]}.` };
  const note = str(fd, "note");
  if (NOTE_REQUIRED.includes(to) && !note) return { error: to === "INFO_REQUIRED" ? "Describe what information or documents are needed." : "Give the reason for rejection." };
  if (!(await transition(user.id, user.masjidId, app, to, note))) return { error: "The status changed meanwhile. Refresh the page." };
  await audit(user, `application.${to.toLowerCase()}`, "Application", app.id, `${APP_STATUS_LABEL[to]}: ${app.appCode} (${app.form.name}, ${app.applicant.name})${note ? ` — ${note}` : ""}`);
  revalidatePath(`/admin/applications/${app.id}`);
  revalidatePath("/admin/applications");
  return { ok: `Marked as ${APP_STATUS_LABEL[to]}. The applicant has been notified.` };
}

async function nextCertificateNo(masjidId: string) {
  const seq = (await db.masjid.update({ where: { id: masjidId }, data: { certificateSeq: { increment: 1 } } })).certificateSeq;
  return `CERT-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
}

/** Issue the certificate for an approved application: generate from the form template and/or upload a signed PDF. */
export async function issueCertificate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const app = await own(user.masjidId, String(fd.get("id")));
  if (!app) return { error: "Application not found" };
  if (app.status !== "APPROVED") return { error: "Only approved applications can be issued a certificate." };
  const text = str(fd, "certificateText");
  const file = fd.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!text && !hasFile) return { error: "Provide the certificate text, upload a PDF, or both." };

  const certificateNo = await nextCertificateNo(user.masjidId);
  // Fill {{certificate_no}} now that the number exists.
  const finalText = text?.replaceAll("{{certificate_no}}", certificateNo) ?? null;
  if (hasFile) {
    const r = await storeUpload(file as File, { masjidId: user.masjidId, uploadedById: user.id, applicationId: app.id, kind: "CERTIFICATE" });
    if ("error" in r) return { error: r.error };
  }
  if (!(await transition(user.id, user.masjidId, app, "CERTIFICATE_READY", `Certificate ${certificateNo} issued.`, { certificateNo, certificateText: finalText })))
    return { error: "The status changed meanwhile. Refresh the page." };
  await audit(user, "application.certificate_issue", "Application", app.id, `Issued certificate ${certificateNo} for ${app.appCode} (${app.applicant.name})`);
  revalidatePath(`/admin/applications/${app.id}`);
  return { ok: `Certificate ${certificateNo} issued. The applicant has been notified.` };
}
