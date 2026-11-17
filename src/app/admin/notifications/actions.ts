"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Audience, NotificationCategory, Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, fromDateTimeInput } from "@/lib/format";
import { notify, resolveAudience, AUDIENCE_LABEL, CATEGORY_LABEL } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";

const schema = z.object({
  title: z.string().min(3, "Title is required").max(120),
  body: z.string().min(3, "Description is required").max(4000),
  category: z.enum(Object.keys(CATEGORY_LABEL) as [NotificationCategory, ...NotificationCategory[]]),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]),
  audience: z.enum(["ALL", "FAMILIES", "MEMBERS", "PENDING_SUBSCRIPTION", "BOARD", "WARDS"]),
  attachmentUrl: z.string().url("Attachment must be a link (https://…)").nullable(),
});

/** Parses a datetime-local value as India time. */
const istDate = fromDateTimeInput;

export async function sendNotification(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = schema.safeParse({
    title: str(fd, "title") ?? "", body: str(fd, "body") ?? "", category: fd.get("category"), priority: fd.get("priority") ?? "NORMAL",
    audience: fd.get("audience"), attachmentUrl: str(fd, "attachmentUrl"),
  });
  if (!p.success) return { error: p.error.issues[0].message };
  const audience = p.data.audience as Audience;
  const values = audience === "WARDS" ? fd.getAll("wards").map(String)
    : (str(fd, "codes") ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (["FAMILIES", "MEMBERS", "WARDS"].includes(audience) && !values.length)
    return { error: audience === "WARDS" ? "Choose at least one ward." : `Enter at least one ${audience === "FAMILIES" ? "family ID (FAM-0001)" : "member ID (MEM-0001)"}.` };
  const publishAt = istDate(str(fd, "publishAt")) ?? new Date();
  const expiresAt = istDate(str(fd, "expiresAt"));
  if (expiresAt && expiresAt <= publishAt) return { error: "Expiry must be after the publication time." };

  const { userIds, unknown } = await resolveAudience(user.masjidId, audience, values);
  if (unknown.length) return { error: `Not found: ${unknown.join(", ")}` };
  if (!userIds.length) return { error: "Nobody in that audience has an activated portal account yet." };

  const label = ["FAMILIES", "MEMBERS", "WARDS"].includes(audience) ? values.join(", ") : AUDIENCE_LABEL[audience];
  const n = await notify({
    masjidId: user.masjidId, ...p.data, priority: p.data.priority as Priority, audience, audienceLabel: label, userIds,
    createdById: user.id, publishAt, expiresAt,
  });
  await audit(user, "notification.publish", "Notification", n.id, `Published "${n.title}" to ${label} (${userIds.length} accounts)`);
  revalidatePath("/admin/notifications");
  const when = publishAt > new Date() ? ` It will appear on ${publishAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.` : "";
  return { ok: `Sent to ${userIds.length} account${userIds.length > 1 ? "s" : ""}.${when}` };
}

export async function withdrawNotification(fd: FormData) {
  const user = await requireAdmin();
  const n = await db.notification.findFirst({ where: { id: String(fd.get("id")), masjidId: user.masjidId } });
  if (!n) return;
  await db.notification.update({ where: { id: n.id }, data: { expiresAt: new Date() } });
  await audit(user, "notification.withdraw", "Notification", n.id, `Withdrew notification "${n.title}"`);
  revalidatePath("/admin/notifications");
}
