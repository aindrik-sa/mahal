import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FORM_CATEGORY_LABEL, type Answers, type FieldSnap } from "@/lib/applications";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Flash } from "@/components/ui";
import { ConfirmButton } from "@/components/action-form";
import { AppStatusBadge, AnswersView, HistoryTimeline } from "@/components/applications";
import { ApplicationForm } from "../application-form";
import { removeDraftFile, deleteDraft } from "../actions";

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const app = await db.application.findFirst({
    where: { id, masjidId: user.masjidId, applicantId: user.id },
    include: {
      form: { include: { fields: { orderBy: { position: "asc" } } } },
      files: { orderBy: { createdAt: "asc" } },
      history: { orderBy: { createdAt: "asc" }, include: { byUser: { select: { name: true } } } },
    },
  });
  if (!app) notFound();
  const editable = app.status === "DRAFT" || app.status === "INFO_REQUIRED";
  const fields = (app.status !== "DRAFT" && app.fieldsSnapshot ? app.fieldsSnapshot : app.form.fields) as FieldSnap[];
  const supporting = app.files.filter((f) => f.kind === "SUPPORTING");
  const certificates = app.files.filter((f) => f.kind === "CERTIFICATE");
  const infoRequest = app.status === "INFO_REQUIRED" ? app.history.findLast((h) => h.to === "INFO_REQUIRED")?.note : null;
  const certReady = app.status === "CERTIFICATE_READY" || app.status === "COMPLETED";

  return (
    <>
      <PageHeader title={app.form.name} subtitle={`${app.appCode ?? "Draft"} · ${FORM_CATEGORY_LABEL[app.form.category]}`}
        actions={<Link href="/applications" className="btn-outline">My applications</Link>} />
      <Flash msg={sp.submitted ? "Application submitted. You'll get a notification when its status changes." : sp.saved ? "Draft saved." : null} />
      {sp.error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Saved as draft, but not submitted: {sp.error}</div>}

      <div className="card mb-4 flex flex-wrap items-center gap-3">
        <AppStatusBadge s={app.status} />
        {app.submittedAt && <span className="text-sm text-stone-600">Submitted {fmtDateTime(app.submittedAt)}</span>}
        {certReady && (
          <div className="flex flex-wrap gap-2 ml-auto">
            {app.certificateText && <Link href={`/applications/${app.id}/certificate`} className="btn">View certificate</Link>}
            {certificates.map((c) => <a key={c.id} href={`/files/${c.id}`} className="btn">Download {c.originalName}</a>)}
          </div>
        )}
      </div>

      {infoRequest && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="font-semibold text-amber-900">The Mahall office needs more information</div>
          <p className="text-amber-900 whitespace-pre-line mt-1">{infoRequest}</p>
          <p className="text-amber-800 mt-2">Update your answers or attach documents below, then resubmit.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2">
          {editable ? (
            <>
              <ApplicationForm formId={app.formId} appId={app.id} fields={fields} answers={app.answers as Answers} files={supporting} resubmit={app.status === "INFO_REQUIRED"} />
              {supporting.length > 0 && (
                <div className="card mt-3 text-sm">
                  <div className="font-medium mb-1">Attached documents</div>
                  <ul className="space-y-1">
                    {supporting.map((f) => (
                      <li key={f.id} className="flex items-center gap-2">
                        <a href={`/files/${f.id}?inline=1`} target="_blank" rel="noopener noreferrer" className="text-emerald-800 hover:underline">{f.originalName}</a>
                        <form action={removeDraftFile} className="ml-auto"><input type="hidden" name="fileId" value={f.id} /><button className="text-red-700 text-xs hover:underline">Remove</button></form>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {app.status === "DRAFT" && !app.appCode && (
                <form action={deleteDraft} className="mt-3"><input type="hidden" name="id" value={app.id} /><ConfirmButton className="btn-danger" message="Delete this draft and its attachments?">Delete draft</ConfirmButton></form>
              )}
            </>
          ) : (
            <div className="card"><h2 className="font-semibold mb-3">Your answers</h2><AnswersView fields={fields} answers={app.answers as Answers} files={supporting} /></div>
          )}
        </section>
        <section className="card h-fit">
          <h2 className="font-semibold mb-3">Status history</h2>
          {app.history.length ? <HistoryTimeline history={app.history} /> : <p className="text-sm text-stone-500">Not submitted yet.</p>}
        </section>
      </div>
    </>
  );
}
