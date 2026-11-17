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
