import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Stat } from "@/components/ui";

// Residents see aggregate figures only — never other families' details (PRD privacy rule).
export default async function MahallPage() {
  const user = await requireUser();
  const m = user.masjidId;
  const [masjid, families, members, male, female, wards] = await Promise.all([
    db.masjid.findUniqueOrThrow({ where: { id: m } }),
    db.family.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.member.count({ where: { masjidId: m, status: "ACTIVE" } }),
    db.member.count({ where: { masjidId: m, status: "ACTIVE", gender: "MALE" } }),
    db.member.count({ where: { masjidId: m, status: "ACTIVE", gender: "FEMALE" } }),
    db.family.groupBy({ by: ["ward"], where: { masjidId: m, status: "ACTIVE" }, _count: true, orderBy: { ward: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title={masjid.name} subtitle={[masjid.address, masjid.phone].filter(Boolean).join(" · ")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Residential families" value={families} />
        <Stat label="Registered members" value={members} />
        <Stat label="Male" value={male} />
        <Stat label="Female" value={female} />
      </div>
      <section className="card max-w-md">
        <h2 className="font-semibold mb-2">Families by ward</h2>
        <ul className="text-sm divide-y divide-stone-100">
          {wards.map((w) => <li key={w.ward ?? "none"} className="py-2 flex justify-between"><span>{w.ward ?? "Unassigned"}</span><span>{w._count}</span></li>)}
        </ul>
      </section>
    </>
  );
}
