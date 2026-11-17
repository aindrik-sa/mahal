"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, fromDateTimeInput, fmtDateTime } from "@/lib/format";
import { notify, resolveAudience } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";

const schema = z.object({
  title: z.string().min(3, "Title is required"),
  description: z.string().nullable(),
  category: z.string().min(2, "Category is required"),
  startsAt: z.date({ message: "Date and start time are required" }),
  location: z.string().min(2, "Location is required"),
  attendance: z.string().min(2),
  attachmentUrl: z.string().url("Attachment must be a link (https://…)").nullable(),
});

const fields = (fd: FormData) => ({
  title: str(fd, "title") ?? "", description: str(fd, "description"), category: str(fd, "category") ?? "",
  startsAt: fromDateTimeInput(str(fd, "startsAt")) ?? undefined, location: str(fd, "location") ?? "",
  attendance: str(fd, "attendance") ?? "Open to all residents", attachmentUrl: str(fd, "attachmentUrl"),
});

async function own(masjidId: string, id: string) {
  return db.meeting.findFirst({ where: { id, masjidId }, include: { agenda: { orderBy: { position: "asc" } } } });
}
const refresh = (id: string) => { revalidatePath(`/admin/meetings/${id}`); revalidatePath("/admin/meetings"); revalidatePath("/meetings"); };

export async function createMeeting(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = schema.safeParse(fields(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const m = await db.$transaction(async (tx) => {
    const seq = (await tx.masjid.update({ where: { id: user.masjidId }, data: { meetingSeq: { increment: 1 } } })).meetingSeq;
    return tx.meeting.create({ data: { ...p.data, masjidId: user.masjidId, createdById: user.id, meetingCode: `MTG-${String(seq).padStart(4, "0")}` } });
  });
  await audit(user, "meeting.create", "Meeting", m.id, `Created meeting ${m.meetingCode}: ${m.title}`);
  redirect(`/admin/meetings/${m.id}`);
}

export async function updateMeeting(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const m = await own(user.masjidId, String(fd.get("id")));
  if (!m) return { error: "Meeting not found" };
  const p = schema.safeParse(fields(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  await db.meeting.update({ where: { id: m.id }, data: p.data });
  const moved = m.status === "PUBLISHED" && (p.data.startsAt.getTime() !== m.startsAt.getTime() || p.data.location !== m.location);
  if (moved && fd.get("notifyChange") === "on") {
    const { userIds } = await resolveAudience(user.masjidId, "ALL");
    await notify({ masjidId: user.masjidId, title: `Meeting updated: ${p.data.title}`, body: `New time and place: ${fmtDateTime(p.data.startsAt)}, ${p.data.location}.`,
      category: "MEETING", priority: "IMPORTANT", audience: "ALL", audienceLabel: "All residents", userIds, createdById: user.id, meetingId: m.id });
  }
  await audit(user, "meeting.update", "Meeting", m.id, `Updated meeting ${m.meetingCode}${moved ? " (time/place changed)" : ""}`);
  refresh(m.id);
  return { ok: moved && fd.get("notifyChange") === "on" ? "Saved and residents notified of the change." : "Saved." };
}

export async function saveAgendaItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const m = await own(user.masjidId, String(fd.get("meetingId")));
  if (!m) return { error: "Meeting not found" };
  const title = str(fd, "title");
  if (!title) return { error: "Agenda item title is required." };
  const id = str(fd, "id");
  const data = { title, details: str(fd, "details"), resolution: str(fd, "resolution") };
  if (id) {
    if (!m.agenda.some((a) => a.id === id)) return { error: "Item not found" };
    await db.agendaItem.update({ where: { id }, data });
  } else {
    await db.agendaItem.create({ data: { ...data, meetingId: m.id, position: (m.agenda.at(-1)?.position ?? 0) + 1 } });
  }
  await audit(user, id ? "agenda.update" : "agenda.create", "Meeting", m.id, `${id ? "Updated" : "Added"} agenda item "${title}" on ${m.meetingCode}`);
  refresh(m.id);
  return { ok: id ? "Saved." : "Agenda item added." };
}

export async function moveAgendaItem(fd: FormData) {
  const user = await requireAdmin();
  const m = await own(user.masjidId, String(fd.get("meetingId")));
  if (!m) return;
  const i = m.agenda.findIndex((a) => a.id === fd.get("id"));
  const j = i + (fd.get("dir") === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= m.agenda.length) return;
  await db.$transaction([
    db.agendaItem.update({ where: { id: m.agenda[i].id }, data: { position: m.agenda[j].position } }),
    db.agendaItem.update({ where: { id: m.agenda[j].id }, data: { position: m.agenda[i].position } }),
  ]);
  refresh(m.id);
}

export async function deleteAgendaItem(fd: FormData) {
  const user = await requireAdmin();
  const m = await own(user.masjidId, String(fd.get("meetingId")));
  const item = m?.agenda.find((a) => a.id === fd.get("id"));
  if (!m || !item) return;
  await db.agendaItem.delete({ where: { id: item.id } });
  await audit(user, "agenda.delete", "Meeting", m.id, `Removed agenda item "${item.title}" from ${m.meetingCode}`);
  refresh(m.id);
}

/** DRAFT → PUBLISHED and notify all residents. Also handles COMPLETED / CANCELLED transitions. */
export async function setMeetingStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const m = await own(user.masjidId, String(fd.get("id")));
  if (!m) return { error: "Meeting not found" };
  const to = String(fd.get("status"));
  const allowed: Record<string, string[]> = { DRAFT: ["PUBLISHED", "CANCELLED"], PUBLISHED: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
  if (!allowed[m.status].includes(to)) return { error: "That change isn't allowed." };
  if (to === "PUBLISHED" && m.agenda.length === 0) return { error: "Add at least one agenda item before publishing." };
  await db.meeting.update({ where: { id: m.id }, data: { status: to as "PUBLISHED" | "COMPLETED" | "CANCELLED" } });
  if ((to === "PUBLISHED" || (to === "CANCELLED" && m.status === "PUBLISHED")) && fd.get("notify") !== "off") {
    const { userIds } = await resolveAudience(user.masjidId, "ALL");
    const agenda = m.agenda.map((a, i) => `${i + 1}. ${a.title}`).join("\n");
    await notify({
      masjidId: user.masjidId, category: "MEETING", audience: "ALL", audienceLabel: "All residents", userIds, createdById: user.id, meetingId: m.id,
      ...(to === "PUBLISHED"
        ? { title: `${m.category}: ${m.title}`, body: `${fmtDateTime(m.startsAt)} at ${m.location}. ${m.attendance}.\n\nAgenda:\n${agenda}`, priority: "IMPORTANT" as const }
        : { title: `Cancelled: ${m.title}`, body: `The meeting on ${fmtDateTime(m.startsAt)} has been cancelled.`, priority: "IMPORTANT" as const }),
    });
  }
  await audit(user, `meeting.${to.toLowerCase()}`, "Meeting", m.id, `${to === "PUBLISHED" ? "Published" : to === "COMPLETED" ? "Marked completed" : "Cancelled"} meeting ${m.meetingCode}`);
  refresh(m.id);
  return { ok: to === "PUBLISHED" ? "Published and residents notified." : "Updated." };
}

export async function saveMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const m = await own(user.masjidId, String(fd.get("id")));
  if (!m) return { error: "Meeting not found" };
  if (m.status !== "COMPLETED") return { error: "Mark the meeting as completed before recording minutes." };
  const minutes = str(fd, "minutes");
  const publish = fd.get("publish") === "on";
  if (publish && !minutes) return { error: "Write the minutes before publishing." };
  const first = publish && !m.minutesPublishedAt;
  await db.meeting.update({ where: { id: m.id }, data: { minutes, minutesPublishedAt: publish ? m.minutesPublishedAt ?? new Date() : null } });
  if (first) {
    const { userIds } = await resolveAudience(user.masjidId, "ALL");
    const decisions = m.agenda.filter((a) => a.resolution).map((a) => `• ${a.title}: ${a.resolution}`).join("\n");
    await notify({ masjidId: user.masjidId, category: "MEETING", audience: "ALL", audienceLabel: "All residents", userIds, createdById: user.id, meetingId: m.id,
      title: `Minutes published: ${m.title}`, body: decisions ? `Decisions:\n${decisions}` : "The minutes of the meeting are now available." });
  }
  await audit(user, publish ? "meeting.minutes_publish" : "meeting.minutes_save", "Meeting", m.id, `${publish ? "Published" : "Saved draft"} minutes for ${m.meetingCode}`);
  refresh(m.id);
  return { ok: first ? "Minutes published and residents notified." : publish ? "Minutes updated." : "Saved as draft (not visible to residents)." };
}
