"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str } from "@/lib/format";
import type { ActionResult } from "@/components/action-form";

// Residents may only change their own phone and email (PRD: "permitted personal contact information").
export async function updateContact(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.memberId) return { error: "No member record is linked to this account." };
  const parsed = z.object({
    phone: z.string().regex(/^[+\d][\d\s-]{6,18}$/, "Invalid phone number").nullable(),
    email: z.string().email("Invalid email").nullable(),
  }).safeParse({ phone: str(fd, "phone"), email: str(fd, "email")?.toLowerCase() ?? null });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { phone, email } = parsed.data;
  if (!phone && !email) return { error: "Keep at least a phone number or email; it is your login." };
  const or: object[] = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  if (await db.user.findFirst({ where: { OR: or, NOT: { id: user.id } } })) return { error: "That phone or email is already used by another account." };
  await db.$transaction([
    db.member.update({ where: { id: user.memberId }, data: { phone, email } }),
    db.user.update({ where: { id: user.id }, data: { phone, email } }),
  ]);
  await audit(user, "member.self_update", "Member", user.memberId, `${user.name} updated their contact details`);
  revalidatePath("/profile");
  return { ok: "Contact details updated." };
}

export async function changePassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== fd.get("confirm")) return { error: "Passwords do not match." };
  if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) return { error: "Current password is incorrect." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  return { ok: "Password changed." };
}
