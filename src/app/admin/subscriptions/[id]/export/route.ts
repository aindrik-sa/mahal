import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { planCollection } from "@/lib/collection";
import { toCsv } from "@/lib/csv";

/** Subscription collection / pending payment report for one plan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.masjidId || user.role === "RESIDENT") return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const plan = await db.subscriptionPlan.findFirst({ where: { id, masjidId: user.masjidId } });
  if (!plan) return new Response("Not found", { status: 404 });
  const f = new URL(req.url).searchParams.get("f");
  const { rows } = await planCollection(user.masjidId, plan.id);
  const shown = rows.filter((r) => !f || f === "all" || (f === "overdue" && r.overdue > 0) || (f === "pending" && r.owedNow > 0) || (f === "paid" && r.owed === 0));
  const csv = toCsv([
    ["family_id", "family_name", "house_number", "ward", "phone", "billed", "paid", "due_now", "remaining_for_year", "overdue_installments", "awaiting_verification", "waived_installments"],
    ...shown.map((r) => [r.familyCode, r.familyName, r.houseNumber, r.ward, r.phone, r.due, r.paid, r.owedNow, r.owed, r.overdue, r.awaiting, r.waived]),
  ]);
  const name = `${plan.name.replace(/[^\w-]+/g, "_")}-${f ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
