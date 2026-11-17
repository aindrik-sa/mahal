import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_TRANSITIONS, APP_STATUS_LABEL, type Answers, type FieldSnap } from "@/lib/applications";
import { draftCertificateText } from "@/lib/certificates";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { AppStatusBadge, AnswersView, HistoryTimeline } from "@/components/applications";
import { changeStatus, issueCertificate } from "../actions";

const ACTION_LABEL: Record<string, { label: string; cls: string; note?: string }> = {
  UNDER_REVIEW: { label: "Start review", cls: "btn-outline" },
  INFO_REQUIRED: { label: "Request more information", cls: "btn-outline", note: "What does the applicant need to provide? (shown to them)" },
  APPROVED: { label: "Approve", cls: "btn" },
  REJECTED: { label: "Reject", cls: "btn-danger", note: "Reason for rejection (shown to the applicant)" },
  COMPLETED: { label: "Mark completed", cls: "btn-outline" },
};

export default async function AdminApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const app = await db.application.findFirst({
    where: { id, masjidId: user.masjidId, status: { not: "DRAFT" } },
    include: {
      form: true, masjid: { select: { name: true } },
      applicant: { select: { name: true, phone: true, email: true, member: { select: { memberCode: true, family: { select: { id: true, familyCode: true, familyName: true } } } } } },
      files: { orderBy: { createdAt: "asc" } },
      history: { orderBy: { createdAt: "asc" }, include: { byUser: { select: { name: true } } } },
    },
  });
  if (!app) notFound();
  const fields = (app.fieldsSnapshot ?? []) as FieldSnap[];
  const next = (ADMIN_TRANSITIONS[app.status] ?? []).filter((s) => s !== "CERTIFICATE_READY");
  const certFiles = app.files.filter((f) => f.kind === "CERTIFICATE");
  const draft = app.status === "APPROVED" ? await draftCertificateText(app, app.masjid.name) : "";
  const fam = app.applicant.member?.family;

  return (
    <>
      <PageHeader title={`${app.appCode} · ${app.form.name}`} subtitle={`Submitted ${fmtDateTime(app.submittedAt)}`}
        actions={<Link href="/admin/applications" className="btn-outline">All applications</Link>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="card text-sm flex flex-wrap gap-x-6 gap-y-1">
            <div><span className="text-stone-500">Applicant:</span> {app.applicant.name} {app.applicant.member && <span className="font-mono text-xs text-stone-500">{app.applicant.member.memberCode}</span>}</div>
            {fam && <div><span className="text-stone-500">Family:</span> <Link className="text-emerald-800 hover:underline" href={`/admin/families/${fam.id}`}>{fam.familyName} ({fam.familyCode})</Link></div>}
            <div><span className="text-stone-500">Contact:</span> {[app.applicant.phone, app.applicant.email].filter(Boolean).join(" · ") || "—"}</div>
          </section>
          <section className="card">
            <h2 className="font-semibold mb-3">Application details</h2>
            <AnswersView fields={fields} answers={app.answers as Answers} files={app.files.filter((f) => f.kind === "SUPPORTING")} />
          </section>

          {app.status === "APPROVED" && (
            <section>
              <h2 className="font-semibold mb-2">Issue certificate</h2>
              <ActionForm action={issueCertificate} className="card grid gap-3" submit="Issue certificate" pendingLabel="Issuing…">
                <input type="hidden" name="id" value={app.id} />
                <label className="field"><span>Certificate text (generated from the form template; edit as needed)</span>
                  <textarea name="certificateText" rows={8} defaultValue={draft} placeholder="Leave empty if you only upload a signed PDF." />
                </label>
                <label className="field"><span>And/or upload signed certificate (PDF, JPG or PNG)</span><input type="file" name="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" /></label>
                <p className="text-xs text-stone-500">A certificate number is assigned on issue and replaces {"{{certificate_no}}"} in the text.</p>
              </ActionForm>
            </section>
          )}
          {(app.status === "CERTIFICATE_READY" || app.status === "COMPLETED") && (
            <section className="card text-sm flex flex-wrap items-center gap-3">
              <span>Certificate <b className="font-mono">{app.certificateNo}</b></span>
              {app.certificateText && <Link href={`/admin/applications/${app.id}/certificate`} className="btn-outline">View / print</Link>}
              {certFiles.map((c) => <a key={c.id} href={`/files/${c.id}?inline=1`} target="_blank" rel="noopener noreferrer" className="btn-outline">{c.originalName}</a>)}
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="card">
            <div className="flex items-center gap-2 mb-3"><h2 className="font-semibold">Status</h2><AppStatusBadge s={app.status} /></div>
            {next.length === 0 && app.status !== "APPROVED" && <p className="text-sm text-stone-500">No further action.</p>}
            {app.status === "APPROVED" && <p className="text-sm text-stone-600 mb-2">Issue the certificate to complete this request.</p>}
            <div className="space-y-2">
              {next.map((to) => {
                const a = ACTION_LABEL[to];
                return a.note ? (
                  <details key={to}>
                    <summary className={`${a.cls} cursor-pointer list-none w-full`}>{a.label}</summary>
                    <ActionForm action={changeStatus} className="mt-2 grid gap-2" submit={`Confirm: ${APP_STATUS_LABEL[to]}`}>
                      <input type="hidden" name="id" value={app.id} /><input type="hidden" name="to" value={to} />
                      <label className="field"><span>{a.note}</span><textarea name="note" rows={3} required /></label>
                    </ActionForm>
                  </details>
                ) : (
                  <ActionForm key={to} action={changeStatus} className="grid">
                    <input type="hidden" name="id" value={app.id} /><input type="hidden" name="to" value={to} />
                    <button className={`${a.cls} w-full`}>{a.label}</button>
                  </ActionForm>
                );
              })}
            </div>
          </section>
          <section className="card">
            <h2 className="font-semibold mb-3">History</h2>
            <HistoryTimeline history={app.history} />
          </section>
        </div>
      </div>
    </>
  );
}
