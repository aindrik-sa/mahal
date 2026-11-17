import type { MeetingStatus } from "@prisma/client";

export function MeetingBadge({ s }: { s: MeetingStatus }) {
  const map = { DRAFT: ["Draft", "bg-stone-200 text-stone-700"], PUBLISHED: ["Upcoming", "bg-emerald-100 text-emerald-800"], COMPLETED: ["Completed", "bg-sky-100 text-sky-800"], CANCELLED: ["Cancelled", "bg-red-100 text-red-800"] } as const;
  return <span className={`badge ${map[s][1]}`}>{map[s][0]}</span>;
}
