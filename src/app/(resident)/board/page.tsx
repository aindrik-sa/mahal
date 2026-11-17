import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";

export default async function BoardPage() {
  const user = await requireUser();
  const board = await db.boardMember.findMany({ where: { masjidId: user.masjidId, status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { fullName: "asc" }] });
  return (
    <>
      <PageHeader title="General Board" subtitle={board[0] ? `Term from ${fmtDate(board[0].termStart)}` : undefined} />
      {board.length === 0 ? <Empty>Board details have not been published yet.</Empty> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {board.map((b) => (
            <div key={b.id} className="card flex gap-3 items-center">
              {b.photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={b.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
                : <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 grid place-items-center font-semibold">{b.fullName[0]}</div>}
              <div className="min-w-0">
                <div className="font-medium truncate">{b.fullName}</div>
                <div className="text-sm text-emerald-800">{b.designation}</div>
                {b.showContact && b.phone && <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="text-sm text-stone-600 hover:underline block">{b.phone}</a>}
                {b.showContact && b.email && <a href={`mailto:${b.email}`} className="text-sm text-stone-600 hover:underline block truncate">{b.email}</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
