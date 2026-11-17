import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { MeetingBadge } from "@/components/meetings";
import { MeetingFields } from "../meeting-fields";
import { updateMeeting, saveAgendaItem, moveAgendaItem, deleteAgendaItem, setMeetingStatus, saveMinutes } from "../actions";

export default async function AdminMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const m = await db.meeting.findFirst({ where: { id, masjidId: user.masjidId }, include: { agenda: { orderBy: { position: "asc" } }, createdBy: { select: { name: true } } } });
  if (!m) notFound();
  const editable = m.status === "DRAFT" || m.status === "PUBLISHED";

  const StatusButton = ({ to, label, cls, confirm }: { to: string; label: string; cls?: string; confirm?: string }) => (
    <ActionForm action={setMeetingStatus} submit={label} pendingLabel="…" className={cls}>
      <input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value={to} />
      {confirm && <p className="text-xs text-stone-500 col-span-full">{confirm}</p>}
    </ActionForm>
  );

  return (
    <>
      <PageHeader title={m.title} subtitle={`${m.meetingCode} · ${m.category} · ${fmtDateTime(m.startsAt)} · ${m.location}`}
        actions={<Link href="/admin/meetings" className="btn-outline">All meetings</Link>} />

      <div className="card mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm">Status: <MeetingBadge s={m.status} /></div>
        {m.status === "DRAFT" && <StatusButton to="PUBLISHED" label="Publish & notify residents" />}
        {m.status === "PUBLISHED" && <StatusButton to="COMPLETED" label="Mark as completed" />}
        {editable && (
          <details className="ml-auto">
            <summary className="btn-danger cursor-pointer list-none">Cancel meeting</summary>
            <div className="mt-2"><StatusButton to="CANCELLED" label="Confirm cancel" confirm={m.status === "PUBLISHED" ? "Residents will be notified." : undefined} /></div>
          </details>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-semibold mb-2">Agenda</h2>
          <ol className="space-y-2 mb-3">
            {m.agenda.map((a, i) => (
              <li key={a.id}>
                <details className="card p-0">
                  <summary className="flex items-start gap-2 px-4 py-3 cursor-pointer list-none text-sm">
                    <span className="text-stone-500 w-5">{i + 1}.</span>
                    <span className="flex-1"><span className="font-medium">{a.title}</span>
                      {a.resolution && <span className="block text-xs text-emerald-800 mt-0.5">Resolution: {a.resolution}</span>}
                    </span>
                  </summary>
                  <div className="border-t border-stone-200 p-4 space-y-3">
                    <ActionForm action={saveAgendaItem} className="grid gap-2" submit="Save item">
                      <input type="hidden" name="meetingId" value={m.id} /><input type="hidden" name="id" value={a.id} />
                      <label className="field"><span>Title</span><input name="title" defaultValue={a.title} required /></label>
                      <label className="field"><span>Details</span><textarea name="details" rows={2} defaultValue={a.details ?? ""} /></label>
                      <label className="field"><span>Decision / resolution (shown once minutes are published)</span><textarea name="resolution" rows={2} defaultValue={a.resolution ?? ""} /></label>
                    </ActionForm>
                    <div className="flex gap-2">
                      {i > 0 && <form action={moveAgendaItem}><input type="hidden" name="meetingId" value={m.id} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="dir" value="up" /><button className="btn-outline">Move up</button></form>}
                      {i < m.agenda.length - 1 && <form action={moveAgendaItem}><input type="hidden" name="meetingId" value={m.id} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="dir" value="down" /><button className="btn-outline">Move down</button></form>}
                      <form action={deleteAgendaItem} className="ml-auto"><input type="hidden" name="meetingId" value={m.id} /><input type="hidden" name="id" value={a.id} /><ConfirmButton className="btn-danger" message={`Remove "${a.title}"?`}>Remove</ConfirmButton></form>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ol>
          <ActionForm action={saveAgendaItem} resetOnOk className="card grid gap-2" submit="Add agenda item">
            <input type="hidden" name="meetingId" value={m.id} />
            <label className="field"><span>New agenda item</span><input name="title" placeholder="e.g. Approval of annual accounts" required /></label>
            <label className="field"><span>Details</span><textarea name="details" rows={2} /></label>
          </ActionForm>
        </section>

        <section className="space-y-6">
          {m.status === "COMPLETED" && (
            <div>
              <h2 className="font-semibold mb-2">Minutes</h2>
              <ActionForm action={saveMinutes} className="card grid gap-3" submit="Save minutes">
                <input type="hidden" name="id" value={m.id} />
                <textarea name="minutes" rows={8} className="input" defaultValue={m.minutes ?? ""} placeholder="Attendance, discussion summary, decisions…" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked={!!m.minutesPublishedAt} /> Published to residents{m.minutesPublishedAt ? ` (since ${fmtDateTime(m.minutesPublishedAt)})` : ""}</label>
                <p className="text-xs text-stone-500">Record each decision in the agenda item&apos;s resolution field. Publishing for the first time notifies residents.</p>
              </ActionForm>
            </div>
          )}
          <div>
            <h2 className="font-semibold mb-2">Meeting details</h2>
            <ActionForm action={updateMeeting} className="card grid gap-4 sm:grid-cols-2" submit="Save details">
              <input type="hidden" name="id" value={m.id} />
              <MeetingFields m={m} />
              {m.status === "PUBLISHED" && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="notifyChange" defaultChecked /> Notify residents if time or location changes</label>}
            </ActionForm>
            <p className="text-xs text-stone-500 mt-2">Created by {m.createdBy?.name ?? "—"}.</p>
          </div>
        </section>
      </div>
    </>
  );
}
