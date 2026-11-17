export const fmtDate = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const toDateInput = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Reads a trimmed string field from FormData; empty -> null. */
export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

export const dateOrNull = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// Meeting and notification times are entered and shown in India time regardless of server timezone.
export const TZ = "Asia/Kolkata";
export const fmtDateTime = (d?: Date | null) =>
  d ? new Date(d).toLocaleString("en-IN", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
/** datetime-local value (IST) for an instant. */
export const toDateTimeInput = (d?: Date | null) =>
  d ? new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 16) : "";
/** Parses a datetime-local value entered in IST. */
export const fromDateTimeInput = (v: string | null) => {
  if (!v) return null;
  const d = new Date(`${v}:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
};
