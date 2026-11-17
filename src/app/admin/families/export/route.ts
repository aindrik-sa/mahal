import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

/** Exports one row per member (same columns the importer accepts, plus IDs and status). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.masjidId || user.role === "RESIDENT") return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") === "INACTIVE" ? "INACTIVE" : sp.get("status") === "all" ? undefined : "ACTIVE";
  const where: Prisma.FamilyWhereInput = { masjidId: user.masjidId, status, ward: sp.get("ward") || undefined };
  const families = await db.family.findMany({ where, orderBy: { familyCode: "asc" }, include: { members: { orderBy: { memberCode: "asc" } } } });

  const rows: (string | null)[][] = [[
    "family_id", "family_name", "house_name", "house_number", "ward", "address", "family_status",
    "member_id", "full_name", "gender", "relationship", "date_of_birth", "phone", "email", "member_status",
  ]];
  for (const f of families)
    for (const m of f.members)
      rows.push([f.familyCode, f.familyName, f.houseName, f.houseNumber, f.ward, f.address, f.status,
        m.memberCode, m.fullName, m.gender, m.relationship, m.dateOfBirth?.toISOString().slice(0, 10) ?? null, m.phone, m.email, m.status]);

  await audit({ id: user.id, masjidId: user.masjidId }, "member.export", "Member", null, `Exported ${rows.length - 1} member rows`);
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mahall-members-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
