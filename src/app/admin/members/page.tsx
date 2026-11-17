import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { PageHeader, StatusBadge, Empty } from "@/components/ui";

const PAGE = 50;

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status === "INACTIVE" ? "INACTIVE" : sp.status === "all" ? undefined : "ACTIVE";
  const gender = sp.gender === "MALE" || sp.gender === "FEMALE" ? sp.gender : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.MemberWhereInput = {
    masjidId: user.masjidId, status, gender,
    ...(q && { OR: [
      { fullName: { contains: q, mode: "insensitive" } }, { memberCode: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } }, { family: { familyCode: { contains: q, mode: "insensitive" } } },
      { family: { houseNumber: { equals: q, mode: "insensitive" } } },
    ] }),
  };
  const [members, total] = await Promise.all([
    db.member.findMany({ where, orderBy: { fullName: "asc" }, skip: (page - 1) * PAGE, take: PAGE, include: { family: { select: { id: true, familyName: true, familyCode: true } } } }),
    db.member.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => new URLSearchParams({ ...(q && { q }), ...(sp.status && { status: sp.status }), ...(gender && { gender }), page: String(p) }).toString();

  return (
    <>
      <PageHeader title="Members" subtitle={`${total} members`} />
      <form className="flex flex-wrap gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="Search name, member/family ID, phone, house no." className="input flex-1 min-w-48" />
        <select name="gender" defaultValue={gender ?? ""} className="input"><option value="">All genders</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select>
        <select name="status" defaultValue={sp.status ?? "ACTIVE"} className="input"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="all">All</option></select>
        <button className="btn-outline">Filter</button>
      </form>
      <div className="card p-0 overflow-x-auto">
        {members.length === 0 ? <Empty>No members found.</Empty> : (
          <table className="table">
            <thead><tr><th>Member ID</th><th>Name</th><th>Family</th><th>Relationship</th><th>Gender</th><th>DOB</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs">{m.memberCode}</td>
                  <td className="font-medium">{m.fullName}</td>
                  <td><Link className="text-emerald-800 hover:underline" href={`/admin/families/${m.family.id}`}>{m.family.familyName}</Link> <span className="text-xs text-stone-500">{m.family.familyCode}</span></td>
                  <td>{m.relationship}</td>
                  <td>{m.gender === "MALE" ? "Male" : "Female"}</td>
                  <td className="whitespace-nowrap">{fmtDate(m.dateOfBirth)}</td>
                  <td className="whitespace-nowrap">{m.phone ?? "—"}</td>
                  <td><StatusBadge status={m.status} /></td>
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
