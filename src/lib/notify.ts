import type { Audience, NotificationCategory, Priority, Prisma } from "@prisma/client";
import { db } from "./db";
import { outstanding, monthLabel, rupees, graceEnd, applyLateFees } from "./billing";

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  SUBSCRIPTION: "Subscription", PAYMENT: "Payment", MEETING: "Meeting", EMERGENCY: "Emergency", ACTIVITY: "Masjid activity",
  APPLICATION: "Application", NOTICE: "Community notice", EVENT: "Holiday & event",
};
export const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: "All residents", FAMILIES: "Specific families", MEMBERS: "Selected members", PENDING_SUBSCRIPTION: "Residents with pending subscription",
  BOARD: "Board members", WARDS: "Specific areas / wards", DIRECT: "Direct",
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

/** Active portal accounts belonging to families that owe an installment already past its due date. */
async function pendingSubscriptionUserIds(masjidId: string) {
  const invs = await db.subscriptionInvoice.findMany({
    where: { masjidId, status: { in: ["PENDING", "PARTIAL"] }, dueDate: { lte: new Date() }, plan: { isActive: true } },
    select: { familyId: true, amount: true, lateFee: true, paidAmount: true, status: true },
  });
  const famIds = [...new Set(invs.filter((i) => outstanding(i) > 0).map((i) => i.familyId))];
  return usersOfFamilies(masjidId, famIds);
}

async function usersOfFamilies(masjidId: string, familyIds: string[]) {
  if (!familyIds.length) return [];
  const users = await db.user.findMany({ where: { masjidId, isActive: true, member: { familyId: { in: familyIds }, status: "ACTIVE" } }, select: { id: true } });
  return users.map((u) => u.id);
}

/**
 * Resolves an audience to user ids. `values` are family codes, member codes or ward names depending on audience.
 * Board members are matched to accounts by phone or email (board records aren't linked to logins).
 */
export async function resolveAudience(masjidId: string, audience: Audience, values: string[] = []): Promise<{ userIds: string[]; unknown: string[] }> {
  const residents = { masjidId, isActive: true, role: "RESIDENT" as const };
  switch (audience) {
    case "ALL":
      return { userIds: (await db.user.findMany({ where: residents, select: { id: true } })).map((u) => u.id), unknown: [] };
    case "FAMILIES": {
      const fams = await db.family.findMany({ where: { masjidId, familyCode: { in: values.map((v) => v.toUpperCase()) } }, select: { id: true, familyCode: true } });
      return { userIds: await usersOfFamilies(masjidId, fams.map((f) => f.id)), unknown: values.filter((v) => !fams.some((f) => f.familyCode === v.toUpperCase())) };
    }
    case "MEMBERS": {
      const mems = await db.member.findMany({ where: { masjidId, memberCode: { in: values.map((v) => v.toUpperCase()) } }, select: { memberCode: true, user: { select: { id: true, isActive: true } } } });
      return {
        userIds: mems.flatMap((m) => (m.user?.isActive ? [m.user.id] : [])),
        unknown: values.filter((v) => !mems.some((m) => m.memberCode === v.toUpperCase())),
      };
    }
    case "WARDS": {
      const fams = await db.family.findMany({ where: { masjidId, status: "ACTIVE", ward: { in: values } }, select: { id: true } });
      return { userIds: await usersOfFamilies(masjidId, fams.map((f) => f.id)), unknown: [] };
    }
    case "PENDING_SUBSCRIPTION":
      return { userIds: await pendingSubscriptionUserIds(masjidId), unknown: [] };
    case "BOARD": {
      const board = await db.boardMember.findMany({ where: { masjidId, status: "ACTIVE" }, select: { phone: true, email: true } });
      const phones = new Set(board.map((b) => digits(b.phone)).filter(Boolean));
      const emails = new Set(board.map((b) => b.email?.toLowerCase()).filter(Boolean));
      const users = await db.user.findMany({ where: { masjidId, isActive: true }, select: { id: true, phone: true, email: true, role: true } });
      return { userIds: users.filter((u) => u.role !== "RESIDENT" || phones.has(digits(u.phone)) || (u.email && emails.has(u.email))).map((u) => u.id), unknown: [] };
    }
    case "DIRECT":
      return { userIds: values, unknown: [] };
  }
}

export type NotifyInput = {
  masjidId: string; title: string; body: string; category: NotificationCategory; priority?: Priority;
  audience: Audience; audienceLabel?: string | null; userIds: string[]; createdById?: string | null; automated?: boolean;
  publishAt?: Date; expiresAt?: Date | null; meetingId?: string | null; attachmentUrl?: string | null;
};

export async function notify(n: NotifyInput, tx: Prisma.TransactionClient = db) {
  const { userIds, ...data } = n;
  return tx.notification.create({
    data: { ...data, recipients: { createMany: { data: [...new Set(userIds)].map((userId) => ({ userId })), skipDuplicates: true } } },
  });
}

/** Sends a direct system notification to every active account in a family. */
export async function notifyFamily(masjidId: string, familyId: string, n: Omit<NotifyInput, "masjidId" | "audience" | "userIds">) {
  const userIds = await usersOfFamilies(masjidId, [familyId]);
  if (!userIds.length) return null;
  return notify({ ...n, masjidId, audience: "DIRECT", userIds, automated: true });
}

/** Notifies all admins of the masjid (e.g. a payment awaiting verification). */
export async function notifyAdmins(masjidId: string, n: Omit<NotifyInput, "masjidId" | "audience" | "userIds">) {
  const admins = await db.user.findMany({ where: { masjidId, isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
  return notify({ ...n, masjidId, audience: "DIRECT", userIds: admins.map((a) => a.id), automated: true });
}

/** Visible notifications for a user: published, not expired. */
export const visibleWhere = (userId: string): Prisma.NotificationRecipientWhereInput => ({
  userId,
  notification: { publishAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
});

export const unreadCount = (userId: string) => db.notificationRecipient.count({ where: { ...visibleWhere(userId), readAt: null } });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const UPCOMING_DAYS = 3;

/**
 * Automated subscription reminders: upcoming (3 days before), due today, and overdue (after grace).
 * One notification per family per kind per run; ReminderLog keeps each installment+kind from repeating.
 * Safe to call on every admin dashboard load and from the cron endpoint.
 */
export async function runSubscriptionReminders(masjidId: string, now = new Date()) {
  await applyLateFees(masjidId); // so overdue amounts in the message include late fees
  const horizon = new Date(now.getTime() + (UPCOMING_DAYS + 1) * 864e5);
  const invs = await db.subscriptionInvoice.findMany({
    where: { masjidId, status: { in: ["PENDING", "PARTIAL"] }, dueDate: { lte: horizon }, plan: { isActive: true } },
    include: {
      plan: { select: { graceDays: true, name: true } },
      reminders: { select: { kind: true } },
      allocations: { where: { payment: { status: "PENDING_VERIFICATION" } }, select: { id: true } },
    },
    orderBy: { periodMonth: "asc" },
  });
  type Inv = (typeof invs)[number];
  const buckets = new Map<string, { familyId: string; kind: "UPCOMING" | "DUE_TODAY" | "OVERDUE"; items: Inv[] }>();
  for (const i of invs) {
    if (outstanding(i) <= 0 || i.allocations.length) continue;
    const kind = now > graceEnd(i, i.plan) ? "OVERDUE" : sameDay(i.dueDate, now) ? "DUE_TODAY" : i.dueDate > now ? "UPCOMING" : null;
    if (!kind || i.reminders.some((r) => r.kind === kind)) continue;
    const key = `${i.familyId}|${kind}`;
    const b = buckets.get(key) ?? { familyId: i.familyId, kind, items: [] };
    b.items.push(i);
    buckets.set(key, b);
  }
  let sent = 0;
  for (const b of buckets.values()) {
    const total = b.items.reduce((s, i) => s + outstanding(i), 0);
    const months = b.items.map((i) => monthLabel(i.periodMonth)).join(", ");
    const copy = {
      UPCOMING: { title: `Subscription due on ${b.items[0].dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, body: `Your installment for ${months} (${rupees(total)}) is due soon. You can pay by UPI from the Subscriptions page.`, priority: "NORMAL" as const },
      DUE_TODAY: { title: "Subscription due today", body: `Your installment for ${months} (${rupees(total)}) is due today.`, priority: "IMPORTANT" as const },
      OVERDUE: { title: "Subscription overdue", body: `Payment for ${months} is overdue. Amount due: ${rupees(total)}. Please pay by UPI or at the Mahall office.`, priority: "IMPORTANT" as const },
    }[b.kind];
    const userIds = await usersOfFamilies(masjidId, [b.familyId]);
    // Claim the reminder rows first: the unique (invoiceId, kind) index makes a concurrent run insert 0 rows and skip sending.
    const claimed = await db.$transaction(async (tx) => {
      const r = await tx.reminderLog.createMany({ data: b.items.map((i) => ({ invoiceId: i.id, kind: b.kind })), skipDuplicates: true });
      if (r.count > 0 && userIds.length) await notify({ masjidId, ...copy, category: "SUBSCRIPTION", audience: "DIRECT", userIds, automated: true }, tx);
      return r.count > 0;
    });
    if (claimed && userIds.length) sent++;
  }
  return sent;
}
