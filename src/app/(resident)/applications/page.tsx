import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FORM_CATEGORY_LABEL } from "@/lib/applications";
import { fmtDate } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { AppStatusBadge } from "@/components/applications";

export default async function ApplicationsPage() {
  const user = await requireUser();
  const [forms, mine] = await Promise.all([
    db.form.findMany({ where: { masjidId: user.masjidId, isActive: true }, orderBy: { name: "asc" } }),
    db.application.findMany({ where: { masjidId: user.masjidId, applicantId: user.id }, orderBy: { updatedAt: "desc" }, include: { form: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Applications" subtitle="Apply for marriage, membership and other masjid certificates." />
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Apply for a certificate</h2>
        {forms.length === 0 ? <div className="card"><Empty>No application forms are open right now.</Empty></div> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {forms.map((f) => (
              <Link key={f.id} href={`/applications/new/${f.id}`} className="card hover:border-emerald-400">
                <div className="font-semibold">{f.name}</div>
                <div className="text-xs text-emerald-800">{FORM_CATEGORY_LABEL[f.category]}</div>
                {f.description && <p className="text-sm text-stone-600 mt-1 line-clamp-2">{f.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="font-semibold mb-2">My applications</h2>
        {mine.length === 0 ? <div className="card"><Empty>You haven&apos;t applied for anything yet.</Empty></div> : (
          <div className="card p-0 divide-y divide-stone-100">
            {mine.map((a) => (
              <Link key={a.id} href={`/applications/${a.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-stone-50 text-sm">
                <span className="font-mono text-xs text-stone-500 w-28">{a.appCode ?? "Not submitted"}</span>
                <span className="font-medium">{a.form.name}</span>
                <AppStatusBadge s={a.status} />
                <span className="text-xs text-stone-500 ml-auto">Updated {fmtDate(a.updatedAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
