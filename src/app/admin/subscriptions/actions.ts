"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str } from "@/lib/format";
import { generateInvoices, rupees } from "@/lib/billing";
import { notify, resolveAudience } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";

const planSchema = z.object({
  name: z.string().min(2, "Name is required"),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, "Choose the start month"),
  months: z.number().int().min(1).max(24),
  annualAmount: z.number().int().min(1, "Annual amount is required"),
  monthlyAmount: z.number().int().min(1, "Monthly installment is required"),
  dueDay: z.number().int().min(1).max(28, "Due day must be 1–28"),
  graceDays: z.number().int().min(0).max(60),
  lateFee: z.number().int().min(0),
  upiId: z.string().regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, "UPI ID looks invalid (e.g. masjid@okaxis)").nullable(),
  upiName: z.string().nullable(),
});

const num = (fd: FormData, k: string) => Number(fd.get(k) || 0);
const planFields = (fd: FormData) => ({
  name: str(fd, "name") ?? "", startMonth: str(fd, "startMonth") ?? "", months: num(fd, "months"), annualAmount: num(fd, "annualAmount"),
  monthlyAmount: num(fd, "monthlyAmount"), dueDay: num(fd, "dueDay"), graceDays: num(fd, "graceDays"), lateFee: num(fd, "lateFee"),
  upiId: str(fd, "upiId"), upiName: str(fd, "upiName"),
});

function check(d: z.infer<typeof planSchema>) {
  if (d.monthlyAmount * d.months !== d.annualAmount)
    return `Monthly × months (${d.monthlyAmount} × ${d.months} = ${d.monthlyAmount * d.months}) must equal the annual amount (${d.annualAmount}).`;
  return null;
}

export async function createPlan(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = planSchema.safeParse(planFields(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const err = check(p.data);
  if (err) return { error: err };
  const plan = await db.subscriptionPlan.create({ data: { ...p.data, startMonth: new Date(`${p.data.startMonth}-01T00:00:00Z`), masjidId: user.masjidId } });
  await audit(user, "subscription.plan_create", "SubscriptionPlan", plan.id, `Created subscription plan ${plan.name} (₹${plan.annualAmount}/year)`);
  redirect(`/admin/subscriptions/${plan.id}`);
}

export async function updatePlan(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const before = await db.subscriptionPlan.findFirst({ where: { id, masjidId: user.masjidId }, include: { _count: { select: { invoices: true } } } });
  if (!before) return { error: "Plan not found" };
  const p = planSchema.safeParse(planFields(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const err = check(p.data);
  if (err) return { error: err };
  const startMonth = new Date(`${p.data.startMonth}-01T00:00:00Z`);
  // Once invoices exist, the billing schedule is locked; only payment details and fees can change.
  if (before._count.invoices > 0 && (startMonth.getTime() !== before.startMonth.getTime() || p.data.months !== before.months
    || p.data.monthlyAmount !== before.monthlyAmount || p.data.dueDay !== before.dueDay))
    return { error: "Invoices already exist, so start month, months, installment and due day are locked. Adjust individual installments instead." };
  await db.subscriptionPlan.update({ where: { id }, data: { ...p.data, startMonth, isActive: fd.get("isActive") === "on" } });
  await audit(user, "subscription.plan_update", "SubscriptionPlan", id, `Updated subscription plan ${p.data.name}`,
    JSON.parse(JSON.stringify({ before, after: p.data })));
  revalidatePath(`/admin/subscriptions/${id}`);
  return { ok: "Plan saved." };
}

export async function runGeneration(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const plan = await db.subscriptionPlan.findFirst({ where: { id: String(fd.get("id")), masjidId: user.masjidId } });
  if (!plan) return { error: "Plan not found" };
  if (!plan.isActive) return { error: "Plan is inactive." };
  const first = (await db.subscriptionInvoice.count({ where: { planId: plan.id } })) === 0;
  const n = await generateInvoices(plan);
  if (first && n > 0) {
    const { userIds } = await resolveAudience(user.masjidId, "ALL");
    await notify({ masjidId: user.masjidId, title: `Subscription period started: ${plan.name}`, body: `The annual masjid subscription is ${rupees(plan.annualAmount)}, payable as ${rupees(plan.monthlyAmount)} a month, due on day ${plan.dueDay} of each month. View your installments on the Subscriptions page.`, category: "SUBSCRIPTION", audience: "ALL", audienceLabel: "All residents", userIds, createdById: user.id, automated: true });
  }
  await audit(user, "subscription.generate", "SubscriptionPlan", plan.id, `Generated ${n} monthly installments for ${plan.name}`);
  revalidatePath(`/admin/subscriptions/${plan.id}`);
  return { ok: n ? `Created ${n} installments.` : "Everything is already up to date; no new installments needed." };
}

async function ownInvoice(masjidId: string, id: string) {
  return db.subscriptionInvoice.findFirst({
    where: { id, masjidId }, include: { family: true, allocations: { where: { payment: { status: "PENDING_VERIFICATION" } } } },
  });
}

export async function waiveInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.masjidId, String(fd.get("id")));
  if (!inv) return { error: "Installment not found" };
  const reason = str(fd, "reason");
  if (!reason) return { error: "Give a reason for the waiver." };
  if (inv.allocations.length) return { error: "A payment for this installment is awaiting verification. Verify or reject it first." };
  const undo = inv.status === "WAIVED";
  await db.subscriptionInvoice.update({
    where: { id: inv.id },
    data: undo ? { status: inv.paidAmount > 0 ? "PARTIAL" : "PENDING", note: `Waiver removed: ${reason}` } : { status: "WAIVED", note: reason },
  });
  await audit(user, undo ? "subscription.unwaive" : "subscription.waive", "SubscriptionInvoice", inv.id,
    `${undo ? "Removed waiver on" : "Waived"} installment for ${inv.family.familyName} (${inv.periodMonth.toISOString().slice(0, 7)}): ${reason}`);
  revalidatePath(`/admin/subscriptions/family/${inv.familyId}`);
  return { ok: undo ? "Waiver removed." : "Installment waived." };
}

export async function adjustInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const inv = await ownInvoice(user.masjidId, String(fd.get("id")));
  if (!inv) return { error: "Installment not found" };
  const amount = Number(fd.get("amount"));
  const lateFee = Number(fd.get("lateFee") || 0);
  const reason = str(fd, "reason");
  if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(lateFee) || lateFee < 0) return { error: "Enter whole rupee amounts." };
  if (!reason) return { error: "Give a reason for the adjustment." };
  if (inv.allocations.length) return { error: "A payment for this installment is awaiting verification. Verify or reject it first." };
  if (amount + lateFee < inv.paidAmount) return { error: `₹${inv.paidAmount} has already been paid; the total can't be lower than that.` };
  const status = inv.status === "WAIVED" ? "WAIVED" : inv.paidAmount >= amount + lateFee ? "PAID" : inv.paidAmount > 0 ? "PARTIAL" : "PENDING";
  await db.subscriptionInvoice.update({ where: { id: inv.id }, data: { amount, lateFee, status, note: reason } });
  await audit(user, "subscription.adjust", "SubscriptionInvoice", inv.id,
    `Adjusted ${inv.family.familyName} ${inv.periodMonth.toISOString().slice(0, 7)}: ₹${inv.amount}+${inv.lateFee} → ₹${amount}+${lateFee} (${reason})`);
  revalidatePath(`/admin/subscriptions/family/${inv.familyId}`);
  return { ok: "Installment adjusted." };
}

export async function setExemption(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const fam = await db.family.findFirst({ where: { id: String(fd.get("familyId")), masjidId: user.masjidId } });
  if (!fam) return { error: "Family not found" };
  const exempt = fd.get("exempt") === "1";
  const reason = str(fd, "reason");
  if (exempt && !reason) return { error: "Give a reason for the exemption." };
  await db.family.update({ where: { id: fam.id }, data: { subscriptionExempt: exempt, exemptReason: exempt ? reason : null } });
  await audit(user, exempt ? "subscription.exempt" : "subscription.unexempt", "Family", fam.id,
    exempt ? `Exempted ${fam.familyName} from subscription: ${reason}` : `Removed subscription exemption for ${fam.familyName}`);
  revalidatePath(`/admin/subscriptions/family/${fam.id}`);
  return { ok: exempt ? "Family exempted. Future invoice generation will skip them; waive any existing installments separately." : "Exemption removed." };
}
