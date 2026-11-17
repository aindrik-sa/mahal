import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { MeetingBadge } from "@/components/meetings";
import { MeetingFields } from "./meeting-fields";
import { createMeeting } from "./actions";

export default async function AdminMeetingsPage() {
  const user = await requireAdmin();
  const meetings = await db.meeting.findMany({ where: { masjidId: user.masjidId }, orderBy: { startsAt: "desc" }, include: { _count: { select: { agenda: true } } } });
  const now = new Date();
  const upcoming = meetings.filter((m) => m.startsAt >= now && m.status !== "CANCELLED").reverse();
  const past = meetings.filter((m) => !upcoming.includes(m));

  const List = ({ rows }: { rows: typeof meetings }) => rows.length === 0 ? <div className="card"><Empty>None.</Empty></div> : (
    <div className="space-y-2">
      {rows.map((m) => (
        <Link key={m.id} href={`/admin/meetings/${m.id}`} className="card block hover:border-emerald-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-stone-500">{m.meetingCode}</span>
            <span className="font-medium">{m.title}</span>
            <MeetingBadge s={m.status} />
            {m.status === "COMPLETED" && !m.minutesPublishedAt && <span className="badge bg-amber-100 text-amber-800">Minutes pending</span>}
          </div>
          <div className="text-sm text-stone-600 mt-1">{m.category} · {fmtDateTime(m.startsAt)} · {m.location} · {m._count.agenda} agenda items</div>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="Meetings & Agendas" subtitle="Create a meeting, add its agenda, then publish to notify residents." />
      <section className="mb-6"><h2 className="font-semibold mb-2">Upcoming</h2><List rows={upcoming} /></section>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">New meeting</h2>
        <ActionForm action={createMeeting} className="card grid gap-4 sm:grid-cols-2" submit="Create draft"><MeetingFields /></ActionForm>
      </section>
      <section><h2 className="font-semibold mb-2">Past &amp; cancelled</h2><List rows={past} /></section>
    </>
  );
}
