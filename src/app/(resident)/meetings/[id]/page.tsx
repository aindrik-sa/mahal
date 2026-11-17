import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { MeetingBadge } from "@/components/meetings";

export default async function ResidentMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const m = await db.meeting.findFirst({ where: { id, masjidId: user.masjidId, status: { not: "DRAFT" } }, include: { agenda: { orderBy: { position: "asc" } } } });
  if (!m) notFound();
  // Minutes and resolutions stay private until the admin publishes them.
  const minutesPublic = !!m.minutesPublishedAt;

  return (
    <>
      <PageHeader title={m.title} subtitle={`${m.category} · ${m.meetingCode}`} actions={<Link href="/meetings" className="btn-outline">All meetings</Link>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card lg:col-span-1 text-sm space-y-2 h-fit">
          <MeetingBadge s={m.status === "PUBLISHED" && m.startsAt < new Date() ? "COMPLETED" : m.status} />
          <div><div className="text-stone-500 text-xs">When</div>{fmtDateTime(m.startsAt)}</div>
          <div><div className="text-stone-500 text-xs">Where</div>{m.location}</div>
          <div><div className="text-stone-500 text-xs">Attendance</div>{m.attendance}</div>
          {m.attachmentUrl && <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-800 hover:underline block">Attachment</a>}
          {m.description && <p className="text-stone-700 whitespace-pre-line border-t border-stone-100 pt-2">{m.description}</p>}
        </section>
        <section className="lg:col-span-2 space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-2">Agenda</h2>
            <ol className="space-y-3">
              {m.agenda.map((a, i) => (
                <li key={a.id} className="text-sm">
                  <div className="font-medium">{i + 1}. {a.title}</div>
                  {a.details && <p className="text-stone-600 whitespace-pre-line">{a.details}</p>}
                  {minutesPublic && a.resolution && <p className="mt-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-emerald-900"><b>Decision:</b> {a.resolution}</p>}
                </li>
              ))}
            </ol>
          </div>
          {minutesPublic && m.minutes && (
            <div className="card">
              <h2 className="font-semibold mb-2">Minutes</h2>
              <p className="text-sm text-stone-700 whitespace-pre-line">{m.minutes}</p>
              <p className="text-xs text-stone-500 mt-2">Published {fmtDateTime(m.minutesPublishedAt)}</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
