import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/ui";

const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireAdmin();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where: { masjidId: user.masjidId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { name: true } } } }),
    db.auditLog.count({ where: { masjidId: user.masjidId } }),
  ]);
  return (
    <>
      <PageHeader title="Activity Logs" subtitle="Every administrative change is recorded here." />
      <div className="card p-0 overflow-x-auto">
        {logs.length === 0 ? <Empty>No activity yet.</Empty> : (
          <table className="table">
            <thead><tr><th>When</th><th>By</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs">{l.createdAt.toLocaleString("en-IN")}</td>
                  <td>{l.user?.name ?? "System"}</td>
                  <td className="font-mono text-xs">{l.action}</td>
                  <td>{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        {page > 1 && <Link className="btn-outline" href={`?page=${page - 1}`}>Newer</Link>}
        {page * PAGE < total && <Link className="btn-outline" href={`?page=${page + 1}`}>Older</Link>}
      </div>
    </>
  );
}
