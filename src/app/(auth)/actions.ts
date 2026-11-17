"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

export type FormState = { error?: string } | undefined;

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("identifier") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!id || !password) return { error: "Enter your email or phone and password." };
  const user = await db.user.findFirst({ where: { OR: [{ email: id }, { phone: id }] } });
  // Always run bcrypt to keep timing similar for unknown users.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok || !user.isActive) return { error: "Incorrect login details." };
  await createSession(user.id);
  redirect(user.role === "RESIDENT" ? "/home" : "/admin");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** Used for both first-time activation (invite) and password reset links. */
export async function setPassword(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== fd.get("confirm")) return { error: "Passwords do not match." };
  const now = new Date();
  const user = await db.user.findFirst({
    where: { OR: [{ inviteToken: token, inviteExpiry: { gt: now } }, { resetToken: token, resetExpiry: { gt: now } }] },
  });
  if (!user) return { error: "This link is invalid or has expired. Ask the Mahall office for a new one." };
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), inviteToken: null, inviteExpiry: null, resetToken: null, resetExpiry: null },
  });
  await db.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  redirect(user.role === "RESIDENT" ? "/home" : "/admin");
}
