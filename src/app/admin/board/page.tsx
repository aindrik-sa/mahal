import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, toDateInput } from "@/lib/format";
import { PageHeader, StatusBadge, Empty } from "@/components/ui";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { saveBoardMember, deleteBoardMember, closeCommittee } from "./actions";
import type { BoardMember } from "@prisma/client";

const DESIGNATIONS = ["President", "Vice President", "General Secretary", "Joint Secretary", "Treasurer", "Executive Committee Member", "Khateeb", "Imam"];

function Fields({ b }: { b?: BoardMember }) {
  return (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <label className="field"><span>Full name *</span><input name="fullName" defaultValue={b?.fullName} required /></label>
      <label className="field"><span>Designation *</span>
        <input name="designation" list="designations" defaultValue={b?.designation} required />
      </label>
      <label className="field"><span>Contact number</span><input name="phone" type="tel" defaultValue={b?.phone ?? ""} /></label>
      <label className="field"><span>Email</span><input name="email" type="email" defaultValue={b?.email ?? ""} /></label>
      <label className="field"><span>Term start *</span><input name="termStart" type="date" defaultValue={toDateInput(b?.termStart)} required /></label>
      <label className="field"><span>Term end</span><input name="termEnd" type="date" defaultValue={toDateInput(b?.termEnd)} /></label>
      <label className="field"><span>Status</span>
        <select name="status" defaultValue={b?.status ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="PREVIOUS">Previous</option></select>
      </label>
      <label className="field"><span>Display order</span><input name="sortOrder" type="number" defaultValue={b?.sortOrder ?? 100} /></label>
      <label className="field sm:col-span-2"><span>Photo URL</span><input name="photoUrl" type="url" placeholder="https://…" defaultValue={b?.photoUrl ?? ""} /></label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="showContact" defaultChecked={b?.showContact ?? true} /> Show contact details to residents</label>
    </>
  );
}

export default async function BoardAdminPage() {
  const user = await requireAdmin();
  const all = await db.boardMember.findMany({ where: { masjidId: user.masjidId }, orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { termStart: "desc" }] });
  const active = all.filter((b) => b.status === "ACTIVE");
  const previous = all.filter((b) => b.status === "PREVIOUS");

  const List = ({ rows }: { rows: BoardMember[] }) => rows.length === 0 ? <Empty>None.</Empty> : (
    <div className="space-y-2">
      {rows.map((b) => (
        <details key={b.id} className="card p-0">
          <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 cursor-pointer list-none">
            <span className="font-medium">{b.fullName}</span>
            <span className="text-sm text-stone-600">{b.designation}</span>
            <StatusBadge status={b.status} />
            <span className="text-xs text-stone-500 ml-auto">{fmtDate(b.termStart)} – {b.termEnd ? fmtDate(b.termEnd) : "present"}</span>
          </summary>
          <div className="border-t border-stone-200 p-4 space-y-3">
            <ActionForm action={saveBoardMember} className="grid gap-4 sm:grid-cols-2" submit="Save"><Fields b={b} /></ActionForm>
            <form action={deleteBoardMember}>
              <input type="hidden" name="id" value={b.id} />
              <ConfirmButton className="btn-danger" message={`Remove ${b.fullName} permanently? Use status "Previous" to keep the record instead.`}>Remove</ConfirmButton>
            </form>
          </div>
        </details>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="Board Management" subtitle={`${active.length} active committee members`} />
      <datalist id="designations">{DESIGNATIONS.map((d) => <option key={d} value={d} />)}</datalist>

      <section className="mb-6"><h2 className="font-semibold mb-2">Current committee</h2><List rows={active} /></section>

      <section className="mb-6">
        <h2 className="font-semibold mb-2">Add board member</h2>
        <ActionForm action={saveBoardMember} resetOnOk className="card grid gap-4 sm:grid-cols-2" submit="Add"><Fields /></ActionForm>
      </section>

      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="font-semibold mb-2">End current term</h2>
          <ActionForm action={closeCommittee} className="card flex flex-wrap items-end gap-3" submit="Move all to previous committee">
            <p className="text-sm text-stone-600 w-full">When a new committee is elected, close the current term first. Members stay on record as previous.</p>
            <label className="field"><span>Term end date</span><input type="date" name="termEnd" required /></label>
          </ActionForm>
        </section>
      )}

      <section><h2 className="font-semibold mb-2">Previous committees</h2><List rows={previous} /></section>
    </>
  );
}
