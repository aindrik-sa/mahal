import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { MeetingBadge } from "@/components/meetings";

export default async function ResidentMeetingsPage() {
  const user = await requireUser();
  const meetings = await db.meeting.findMany({
    where: { masjidId: user.masjidId, status: { not: "DRAFT" } }, orderBy: { startsAt: "desc" },
    include: { agenda: { orderBy: { position: "asc" }, select: { id: true, title: true } } },
  });
  const now = new Date();
  const upcoming = meetings.filter((m) => m.status === "PUBLISHED" && m.startsAt >= now).reverse();
  const past = meetings.filter((m) => !upcoming.includes(m));

  return (
    <>
      <PageHeader title="Agendas & Meetings" />
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Upcoming</h2>
        {upcoming.length === 0 ? <div className="card"><Empty>No upcoming meetings.</Empty></div> : (
          <div className="space-y-3">
            {upcoming.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="card block hover:border-emerald-400">
                <div className="text-xs font-medium uppercase tracking-wide text-emerald-800">{m.category}</div>
                <div className="font-semibold text-lg">{m.title}</div>
                <div className="text-sm text-stone-700 mt-1">{fmtDateTime(m.startsAt)} · {m.location}</div>
                <div className="text-xs text-stone-500">{m.attendance}</div>
                <ol className="list-decimal list-inside text-sm text-stone-600 mt-2">{m.agenda.slice(0, 4).map((a) => <li key={a.id}>{a.title}</li>)}</ol>
                {m.agenda.length > 4 && <div className="text-xs text-stone-500 mt-1">+{m.agenda.length - 4} more</div>}
              </Link>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="font-semibold mb-2">Past meetings</h2>
        {past.length === 0 ? <div className="card"><Empty>None yet.</Empty></div> : (
          <div className="card p-0 divide-y divide-stone-100">
            {past.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-stone-50 text-sm">
                <span className="font-medium">{m.title}</span>
                <MeetingBadge s={m.status === "PUBLISHED" ? "COMPLETED" : m.status} />
                {m.minutesPublishedAt && <span className="badge bg-emerald-100 text-emerald-800">Minutes available</span>}
                <span className="text-stone-500 ml-auto">{fmtDateTime(m.startsAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
