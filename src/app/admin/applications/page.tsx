import Link from "next/link";
import type { ApplicationStatus, FormCategory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { APP_STATUS_LABEL, FORM_CATEGORY_LABEL } from "@/lib/applications";
import { fmtDate } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { AppStatusBadge } from "@/components/applications";

const PAGE = 30;
const OPEN: ApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED", "APPROVED"];

export default async function AdminApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status && sp.status in APP_STATUS_LABEL ? (sp.status as ApplicationStatus) : undefined;
  const cat = sp.cat && sp.cat in FORM_CATEGORY_LABEL ? (sp.cat as FormCategory) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ApplicationWhereInput = {
    masjidId: user.masjidId,
    status: status ?? (sp.status === "all" ? { not: "DRAFT" } : { in: OPEN }),
    ...(cat && { form: { category: cat } }),
    ...(q && { OR: [{ appCode: { contains: q, mode: "insensitive" } }, { certificateNo: { contains: q, mode: "insensitive" } }, { applicant: { name: { contains: q, mode: "insensitive" } } }] }),
  };
  const [apps, total, counts] = await Promise.all([
    db.application.findMany({ where, orderBy: { submittedAt: "asc" }, skip: (page - 1) * PAGE, take: PAGE, include: { form: { select: { name: true } }, applicant: { select: { name: true } } } }),
    db.application.count({ where }),
    db.application.groupBy({ by: ["status"], where: { masjidId: user.masjidId, status: { in: OPEN } }, _count: true }),
  ]);
  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ ...(q && { q }), ...(sp.status && { status: sp.status }), ...(cat && { cat }), ...o })}`;

  return (
    <>
      <PageHeader title="Applications" subtitle="Certificate requests from residents. Oldest first." actions={<Link href="/admin/forms" className="btn-outline">Form builder</Link>} />
      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        {counts.map((c) => <Link key={c.status} href={`?status=${c.status}`} className="badge bg-stone-100 text-stone-700 px-3 py-1">{APP_STATUS_LABEL[c.status]}: {c._count}</Link>)}
      </div>
      <form className="flex flex-wrap gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="Application ID, certificate no. or applicant" className="input flex-1 min-w-48" />
        <select name="status" defaultValue={sp.status ?? ""} className="input">
          <option value="">Open (needs action)</option><option value="all">All</option>
          {Object.entries(APP_STATUS_LABEL).filter(([k]) => k !== "DRAFT").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="cat" defaultValue={cat ?? ""} className="input"><option value="">All categories</option>{Object.entries(FORM_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn-outline">Filter</button>
      </form>
      <div className="card p-0 overflow-x-auto">
        {apps.length === 0 ? <Empty>No applications.</Empty> : (
          <table className="table">
            <thead><tr><th>Application</th><th>Form</th><th>Applicant</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs"><Link className="text-emerald-800 hover:underline" href={`/admin/applications/${a.id}`}>{a.appCode}</Link></td>
                  <td>{a.form.name}</td>
                  <td>{a.applicant.name}</td>
                  <td className="whitespace-nowrap">{fmtDate(a.submittedAt)}</td>
                  <td><AppStatusBadge s={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        {page > 1 && <Link className="btn-outline" href={qs({ page: String(page - 1) })}>Previous</Link>}
        {page * PAGE < total && <Link className="btn-outline" href={qs({ page: String(page + 1) })}>Next</Link>}
      </div>
    </>
  );
}
