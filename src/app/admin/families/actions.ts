"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, newToken } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextCode } from "@/lib/codes";
import { str, dateOrNull } from "@/lib/format";
import { parseCsv } from "@/lib/csv";
import type { ActionResult } from "@/components/action-form";
import type { Family } from "@prisma/client";

const phoneRe = /^[+\d][\d\s-]{6,18}$/;
const optPhone = z.string().regex(phoneRe, "Invalid phone number").nullable();

const familySchema = z.object({
  familyName: z.string().min(2, "Family name is required"),
  houseName: z.string().nullable(), houseNumber: z.string().nullable(), address: z.string().nullable(),
  ward: z.string().nullable(), primaryPhone: optPhone, secondaryPhone: optPhone,
});

const familyFields = (fd: FormData) => ({
  familyName: str(fd, "familyName") ?? "", houseName: str(fd, "houseName"), houseNumber: str(fd, "houseNumber"),
  address: str(fd, "address"), ward: str(fd, "ward"), primaryPhone: str(fd, "primaryPhone"), secondaryPhone: str(fd, "secondaryPhone"),
});

async function duplicateHouse(masjidId: string, houseNumber: string | null, ward: string | null, exceptId?: string) {
  if (!houseNumber) return null;
  return db.family.findFirst({ where: { masjidId, houseNumber, ward, NOT: exceptId ? { id: exceptId } : undefined } });
}

export async function createFamily(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = familySchema.safeParse(familyFields(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const headName = str(fd, "headName");
  if (!headName) return { error: "Family head name is required" };
  const dup = await duplicateHouse(user.masjidId, parsed.data.houseNumber, parsed.data.ward);
  if (dup) return { error: `House number already registered to ${dup.familyName} (${dup.familyCode}).` };

  const family = await db.$transaction(async (tx) => {
    const f = await tx.family.create({ data: { ...parsed.data, masjidId: user.masjidId, familyCode: await nextCode(tx, user.masjidId, "family") } });
    const head = await tx.member.create({
      data: {
        masjidId: user.masjidId, familyId: f.id, memberCode: await nextCode(tx, user.masjidId, "member"), fullName: headName,
        gender: fd.get("headGender") === "FEMALE" ? "FEMALE" : "MALE", relationship: "Head", phone: parsed.data.primaryPhone, address: parsed.data.address,
      },
    });
    return tx.family.update({ where: { id: f.id }, data: { headMemberId: head.id } });
  });
  await audit(user, "family.create", "Family", family.id, `Created family ${family.familyName} (${family.familyCode})`);
  redirect(`/admin/families/${family.id}`);
}

export async function updateFamily(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const parsed = familySchema.safeParse(familyFields(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const fam = await db.family.findFirst({ where: { id, masjidId: user.masjidId } });
  if (!fam) return { error: "Family not found" };
  const dup = await duplicateHouse(user.masjidId, parsed.data.houseNumber, parsed.data.ward, id);
  if (dup) return { error: `House number already registered to ${dup.familyName} (${dup.familyCode}).` };
  await db.family.update({ where: { id }, data: parsed.data });
  await audit(user, "family.update", "Family", id, `Updated family ${parsed.data.familyName} (${fam.familyCode})`,
    JSON.parse(JSON.stringify({ before: fam, after: parsed.data })));
  revalidatePath(`/admin/families/${id}`);
  return { ok: "Family details saved." };
}

export async function setFamilyStatus(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const status = fd.get("status") === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const fam = await db.family.findFirst({ where: { id, masjidId: user.masjidId } });
  if (!fam) return;
  await db.$transaction([
    db.family.update({ where: { id }, data: { status } }),
    ...(status === "INACTIVE" ? [db.member.updateMany({ where: { familyId: id }, data: { status } })] : []),
  ]);
  await audit(user, `family.${status === "ACTIVE" ? "activate" : "deactivate"}`, "Family", id, `${status === "ACTIVE" ? "Activated" : "Deactivated"} family ${fam.familyName}`);
  revalidatePath(`/admin/families/${id}`);
}

const memberSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  gender: z.enum(["MALE", "FEMALE"], { message: "Select gender" }),
  relationship: z.string().min(1, "Relationship is required"),
  dateOfBirth: z.date().nullable(),
  phone: optPhone,
  email: z.string().email("Invalid email").nullable(),
  address: z.string().nullable(),
});

const memberFields = (fd: FormData) => ({
  fullName: str(fd, "fullName") ?? "", gender: str(fd, "gender") ?? "", relationship: str(fd, "relationship") ?? "",
  dateOfBirth: dateOrNull(fd, "dateOfBirth"), phone: str(fd, "phone"), email: str(fd, "email")?.toLowerCase() ?? null, address: str(fd, "address"),
});

async function duplicateMember(masjidId: string, m: z.infer<typeof memberSchema>, exceptId?: string) {
  const or: object[] = [];
  if (m.phone) or.push({ phone: m.phone });
  if (m.email) or.push({ email: m.email });
  if (m.dateOfBirth) or.push({ fullName: { equals: m.fullName, mode: "insensitive" }, dateOfBirth: m.dateOfBirth });
  if (!or.length) return null;
  return db.member.findFirst({ where: { masjidId, OR: or, NOT: exceptId ? { id: exceptId } : undefined }, include: { family: true } });
}

export async function saveMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const id = str(fd, "id");
  const familyId = String(fd.get("familyId"));
  const family = await db.family.findFirst({ where: { id: familyId, masjidId: user.masjidId } });
  if (!family) return { error: "Family not found" };
  const parsed = memberSchema.safeParse(memberFields(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const dup = await duplicateMember(user.masjidId, parsed.data, id ?? undefined);
  if (dup) return { error: `Possible duplicate: ${dup.fullName} (${dup.memberCode}) in ${dup.family.familyName} has the same phone, email or name + date of birth.` };

  if (id) {
    const before = await db.member.findFirst({ where: { id, masjidId: user.masjidId } });
    if (!before) return { error: "Member not found" };
    await db.member.update({ where: { id }, data: parsed.data });
    await audit(user, "member.update", "Member", id, `Updated member ${parsed.data.fullName} (${before.memberCode})`);
  } else {
    const m = await db.$transaction(async (tx) =>
      tx.member.create({ data: { ...parsed.data, address: parsed.data.address ?? family.address, masjidId: user.masjidId, familyId, memberCode: await nextCode(tx, user.masjidId, "member") } }));
    await audit(user, "member.create", "Member", m.id, `Added ${m.fullName} (${m.memberCode}) to ${family.familyName}`);
  }
  revalidatePath(`/admin/families/${familyId}`);
  return { ok: id ? "Member saved." : "Member added." };
}

export async function setMemberStatus(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const status = fd.get("status") === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const m = await db.member.findFirst({ where: { id, masjidId: user.masjidId } });
  if (!m) return;
  await db.member.update({ where: { id }, data: { status } });
  if (status === "INACTIVE") {
    const u = await db.user.findFirst({ where: { memberId: id } });
    if (u) await db.$transaction([db.user.update({ where: { id: u.id }, data: { isActive: false } }), db.session.deleteMany({ where: { userId: u.id } })]);
  }
  await audit(user, `member.${status === "ACTIVE" ? "activate" : "deactivate"}`, "Member", id, `${status === "ACTIVE" ? "Activated" : "Deactivated"} ${m.fullName}`);
  revalidatePath(`/admin/families/${m.familyId}`);
}

export async function setFamilyHead(fd: FormData) {
  const user = await requireAdmin();
  const memberId = String(fd.get("memberId"));
  const m = await db.member.findFirst({ where: { id: memberId, masjidId: user.masjidId }, include: { family: true } });
  if (!m) return;
  await db.family.update({ where: { id: m.familyId }, data: { headMemberId: m.id } });
  await audit(user, "family.head", "Family", m.familyId, `Set ${m.fullName} as head of ${m.family.familyName}`);
  revalidatePath(`/admin/families/${m.familyId}`);
}

/** Creates a login invite for a member, or a password-reset link if they already have an account. */
export async function inviteMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const memberId = String(fd.get("memberId"));
  const m = await db.member.findFirst({ where: { id: memberId, masjidId: admin.masjidId }, include: { user: true } });
  if (!m) return { error: "Member not found" };
  if (m.status !== "ACTIVE") return { error: "Member is inactive." };
  const token = newToken();
  const expiry = new Date(Date.now() + 7 * 864e5);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  if (m.user) {
    await db.user.update({ where: { id: m.user.id }, data: { resetToken: token, resetExpiry: expiry, isActive: true } });
    await audit(admin, "user.reset_link", "User", m.user.id, `Issued password reset link for ${m.fullName}`);
    return { ok: "Password reset link created.", link: `${origin}/activate/${token}` };
  }
  if (!m.email && !m.phone) return { error: "Add a phone number or email to this member first; it becomes their login." };
  const or: object[] = [];
  if (m.email) or.push({ email: m.email });
  if (m.phone) or.push({ phone: m.phone });
  if (await db.user.findFirst({ where: { OR: or } })) return { error: "Another account already uses this phone or email." };
  const u = await db.user.create({
    data: { masjidId: admin.masjidId, name: m.fullName, email: m.email, phone: m.phone, role: "RESIDENT", memberId: m.id, inviteToken: token, inviteExpiry: expiry },
  });
  await audit(admin, "user.invite", "User", u.id, `Invited ${m.fullName} to the portal`);
  revalidatePath(`/admin/families/${m.familyId}`);
  return { ok: `Account created. Login: ${m.phone ?? m.email}`, link: `${origin}/activate/${token}` };
}

/**
 * CSV import, one row per member. Header row required. Columns:
 * family_name, house_name, house_number, ward, address, full_name, gender, relationship, date_of_birth, phone, email
 * Rows group into families by (house_number, ward), or family_name when there is no house number.
 */
export async function importCsv(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 2_000_000) return { error: "File too large (max 2 MB)." };
  const rows = parseCsv(await file.text());
  if (!rows.length) return { error: "No rows found." };
  const missing = ["family_name", "full_name", "gender", "relationship"].filter((c) => !(c in rows[0]));
  if (missing.length) return { error: `Missing columns: ${missing.join(", ")}` };

  const nn = (v?: string) => (v && v.trim() ? v.trim() : null);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = nn(r.house_number) ? `${r.house_number}|${r.ward ?? ""}` : `name|${r.family_name}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  let famCount = 0, memCount = 0;
  const skipped: string[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    await db.$transaction(async (tx) => {
      let family: Family | null = nn(first.house_number)
        ? await tx.family.findFirst({ where: { masjidId: user.masjidId, houseNumber: nn(first.house_number), ward: nn(first.ward) } })
        : await tx.family.findFirst({ where: { masjidId: user.masjidId, familyName: first.family_name, houseNumber: null } });
      if (!family) {
        family = await tx.family.create({
          data: { masjidId: user.masjidId, familyCode: await nextCode(tx, user.masjidId, "family"), familyName: first.family_name,
            houseName: nn(first.house_name), houseNumber: nn(first.house_number), ward: nn(first.ward), address: nn(first.address),
            primaryPhone: nn(group.find((g) => /head/i.test(g.relationship))?.phone) },
        });
        famCount++;
      }
      for (const r of group) {
        const gender = /^f/i.test(r.gender) ? "FEMALE" : /^m/i.test(r.gender) ? "MALE" : null;
        if (!nn(r.full_name) || !gender) { skipped.push(`${r.full_name || "(no name)"}: missing name or gender`); continue; }
        const exists = await tx.member.findFirst({ where: { familyId: family.id, fullName: { equals: r.full_name, mode: "insensitive" } } });
        if (exists) { skipped.push(`${r.full_name}: already in ${family.familyName}`); continue; }
        const dob = nn(r.date_of_birth) ? new Date(r.date_of_birth) : null;
        const fam: Family = family;
        const m: { id: string } = await tx.member.create({
          data: { masjidId: user.masjidId, familyId: fam.id, memberCode: await nextCode(tx, user.masjidId, "member"), fullName: r.full_name, gender,
            relationship: nn(r.relationship) ?? "Member", dateOfBirth: dob && !isNaN(dob.getTime()) ? dob : null,
            phone: nn(r.phone), email: nn(r.email)?.toLowerCase() ?? null, address: fam.address },
        });
        memCount++;
        if (/head/i.test(r.relationship) && !family.headMemberId) family = await tx.family.update({ where: { id: family.id }, data: { headMemberId: m.id } });
      }
    }, { timeout: 30000 });
  }
  await audit(user, "member.import", "Member", null, `Imported ${famCount} families and ${memCount} members from CSV`, { skipped });
  revalidatePath("/admin/families");
  const skipMsg = skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "…" : ""}` : "";
  return { ok: `Imported ${famCount} new families and ${memCount} members.${skipMsg}` };
}
