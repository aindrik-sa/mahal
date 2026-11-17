import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, StatusBadge, Empty } from "@/components/ui";

const PAGE = 25;

export default async function FamiliesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status === "INACTIVE" ? "INACTIVE" : sp.status === "all" ? undefined : "ACTIVE";
  const ward = sp.ward || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.FamilyWhereInput = {
    masjidId: user.masjidId, status, ward,
    ...(q && {
      OR: [
        { familyName: { contains: q, mode: "insensitive" } }, { familyCode: { contains: q, mode: "insensitive" } },
        { houseNumber: { equals: q, mode: "insensitive" } }, { houseName: { contains: q, mode: "insensitive" } },
        { members: { some: { fullName: { contains: q, mode: "insensitive" } } } },
      ],
    }),
  };
  const [families, total, wards] = await Promise.all([
    db.family.findMany({
      where, orderBy: { familyCode: "asc" }, skip: (page - 1) * PAGE, take: PAGE,
      include: { headMember: { select: { fullName: true } }, _count: { select: { members: { where: { status: "ACTIVE" } } } } },
    }),
    db.family.count({ where }),
    db.family.findMany({ where: { masjidId: user.masjidId, ward: { not: null } }, distinct: ["ward"], select: { ward: true }, orderBy: { ward: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => new URLSearchParams({ ...(q && { q }), ...(sp.status && { status: sp.status }), ...(ward && { ward }), page: String(p) }).toString();

  return (
    <>
      <PageHeader title="Residential Management" subtitle={`${total} families`}
        actions={<>
          <Link href="/admin/families/import" className="btn-outline">Import CSV</Link>
          <a href={`/admin/families/export?${qs(1)}`} className="btn-outline">Export CSV</a>
          <Link href="/admin/families/new" className="btn">Add family</Link>
        </>} />
      <form className="flex flex-wrap gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="Search name, family ID, house no." className="input flex-1 min-w-48" />
        <select name="ward" defaultValue={ward ?? ""} className="input">
          <option value="">All wards</option>
          {wards.map((w) => <option key={w.ward} value={w.ward!}>{w.ward}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? "ACTIVE"} className="input">
          <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="all">All</option>
        </select>
        <button className="btn-outline">Filter</button>
      </form>
      <div className="card p-0 overflow-x-auto">
        {families.length === 0 ? <Empty>No families found.</Empty> : (
          <table className="table">
            <thead><tr><th>Family ID</th><th>Family</th><th>House</th><th>Ward</th><th>Head</th><th>Members</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              {families.map((f) => (
                <tr key={f.id} className="hover:bg-stone-50">
                  <td className="font-mono text-xs"><Link href={`/admin/families/${f.id}`} className="text-emerald-800 hover:underline">{f.familyCode}</Link></td>
                  <td><Link href={`/admin/families/${f.id}`} className="font-medium hover:underline">{f.familyName}</Link></td>
                  <td>{[f.houseNumber, f.houseName].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{f.ward ?? "—"}</td>
                  <td>{f.headMember?.fullName ?? "—"}</td>
                  <td>{f._count.members}</td>
                  <td className="whitespace-nowrap">{f.primaryPhone ?? "—"}</td>
                  <td><StatusBadge status={f.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-stone-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-outline" href={`?${qs(page - 1)}`}>Previous</Link>}
            {page < pages && <Link className="btn-outline" href={`?${qs(page + 1)}`}>Next</Link>}
          </div>
        </div>
      )}
    </>
  );
}
