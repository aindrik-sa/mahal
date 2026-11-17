"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, dateOrNull } from "@/lib/format";
import type { ActionResult } from "@/components/action-form";

const schema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  designation: z.string().min(2, "Designation is required"),
  phone: z.string().regex(/^[+\d][\d\s-]{6,18}$/, "Invalid phone number").nullable(),
  email: z.string().email("Invalid email").nullable(),
  photoUrl: z.string().url("Photo must be a URL").nullable(),
  termStart: z.date({ message: "Term start date is required" }),
  termEnd: z.date().nullable(),
  status: z.enum(["ACTIVE", "PREVIOUS"]),
  showContact: z.boolean(),
  sortOrder: z.number().int(),
});

export async function saveBoardMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const id = str(fd, "id");
  const parsed = schema.safeParse({
    fullName: str(fd, "fullName") ?? "", designation: str(fd, "designation") ?? "", phone: str(fd, "phone"), email: str(fd, "email"),
    photoUrl: str(fd, "photoUrl"), termStart: dateOrNull(fd, "termStart") ?? undefined, termEnd: dateOrNull(fd, "termEnd"),
    status: fd.get("status") === "PREVIOUS" ? "PREVIOUS" : "ACTIVE", showContact: fd.get("showContact") === "on", sortOrder: Number(fd.get("sortOrder") || 100),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.termEnd && parsed.data.termEnd < parsed.data.termStart) return { error: "Term end must be after term start." };
  if (id) {
    const before = await db.boardMember.findFirst({ where: { id, masjidId: user.masjidId } });
    if (!before) return { error: "Board member not found" };
    await db.boardMember.update({ where: { id }, data: parsed.data });
    await audit(user, "board.update", "BoardMember", id, `Updated board member ${parsed.data.fullName} (${parsed.data.designation})`);
  } else {
    const b = await db.boardMember.create({ data: { ...parsed.data, masjidId: user.masjidId } });
    await audit(user, "board.create", "BoardMember", b.id, `Added ${b.fullName} as ${b.designation}`);
  }
  revalidatePath("/admin/board");
  revalidatePath("/board");
  return { ok: "Saved." };
}

/** Moves all active members to PREVIOUS with the given term end date — used when a new committee takes over. */
export async function closeCommittee(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const end = dateOrNull(fd, "termEnd");
  if (!end) return { error: "Choose the term end date." };
  const r = await db.boardMember.updateMany({ where: { masjidId: user.masjidId, status: "ACTIVE" }, data: { status: "PREVIOUS", termEnd: end } });
  await audit(user, "board.close_term", "BoardMember", null, `Closed committee term: ${r.count} members moved to previous`);
  revalidatePath("/admin/board");
  revalidatePath("/board");
  return { ok: `${r.count} members moved to previous committee.` };
}

export async function deleteBoardMember(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const b = await db.boardMember.findFirst({ where: { id, masjidId: user.masjidId } });
  if (!b) return;
  await db.boardMember.delete({ where: { id } });
  await audit(user, "board.delete", "BoardMember", id, `Removed board member ${b.fullName} (${b.designation})`, JSON.parse(JSON.stringify(b)));
  revalidatePath("/admin/board");
  revalidatePath("/board");
}
