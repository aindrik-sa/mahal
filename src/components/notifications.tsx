import type { Priority } from "@prisma/client";

export function PriorityBadge({ p }: { p: Priority }) {
  if (p === "NORMAL") return null;
  return <span className={`badge ${p === "URGENT" ? "bg-red-600 text-white" : "bg-amber-100 text-amber-800"}`}>{p === "URGENT" ? "Urgent" : "Important"}</span>;
}
