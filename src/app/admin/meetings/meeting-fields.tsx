import type { Meeting } from "@prisma/client";
import { toDateTimeInput } from "@/lib/format";

const CATEGORIES = ["General Body Meeting", "Committee Meeting", "Special General Body", "Ramadan Planning", "Community Event"];

export function MeetingFields({ m }: { m?: Meeting }) {
  return (
    <>
      <datalist id="meeting-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <label className="field sm:col-span-2"><span>Meeting title *</span><input name="title" defaultValue={m?.title} required /></label>
      <label className="field"><span>Category *</span><input name="category" list="meeting-categories" defaultValue={m?.category ?? "General Body Meeting"} required /></label>
      <label className="field"><span>Date &amp; start time *</span><input name="startsAt" type="datetime-local" defaultValue={toDateTimeInput(m?.startsAt)} required /></label>
      <label className="field"><span>Location *</span><input name="location" defaultValue={m?.location ?? "Masjid hall"} required /></label>
      <label className="field"><span>Attendance</span>
        <input name="attendance" list="attendance-options" defaultValue={m?.attendance ?? "Open to all residents"} />
        <datalist id="attendance-options">
          <option value="Open to all residents" /><option value="Family heads required" /><option value="Board members only" /><option value="Attendance mandatory" />
        </datalist>
      </label>
      <label className="field sm:col-span-2"><span>Description</span><textarea name="description" rows={3} defaultValue={m?.description ?? ""} /></label>
      <label className="field sm:col-span-2"><span>Attachment link (optional)</span><input name="attachmentUrl" type="url" placeholder="https://…" defaultValue={m?.attachmentUrl ?? ""} /></label>
    </>
  );
}
