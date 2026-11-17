import type { Prisma } from "@prisma/client";

/** Atomically increments the masjid's counter and returns e.g. FAM-0012. Call inside a transaction. */
export async function nextCode(tx: Prisma.TransactionClient, masjidId: string, kind: "family" | "member") {
  const field = kind === "family" ? "familySeq" : "memberSeq";
  const m = await tx.masjid.update({ where: { id: masjidId }, data: { [field]: { increment: 1 } } });
  const n = kind === "family" ? m.familySeq : m.memberSeq;
  return `${kind === "family" ? "FAM" : "MEM"}-${String(n).padStart(4, "0")}`;
}
