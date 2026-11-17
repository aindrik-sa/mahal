import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, toDateInput } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { FamilyFields } from "../family-fields";
import { updateFamily, setFamilyStatus, saveMember, setMemberStatus, setFamilyHead, inviteMember } from "../actions";
import type { Member } from "@prisma/client";

const RELATIONS = ["Head", "Wife", "Husband", "Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Grandson", "Granddaughter", "Daughter-in-law", "Son-in-law", "Other"];

function MemberFields({ m, familyId }: { m?: Member; familyId: string }) {
  return (
    <>
      <input type="hidden" name="familyId" value={familyId} />
      {m && <input type="hidden" name="id" value={m.id} />}
      <label className="field"><span>Full name *</span><input name="fullName" defaultValue={m?.fullName} required /></label>
      <label className="field"><span>Gender *</span>
        <select name="gender" defaultValue={m?.gender ?? ""} required><option value="" disabled>Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select>
      </label>
      <label className="field"><span>Relationship to head *</span>
        <select name="relationship" defaultValue={m?.relationship ?? ""} required>
          <option value="" disabled>Select</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <label className="field"><span>Date of birth</span><input name="dateOfBirth" type="date" defaultValue={toDateInput(m?.dateOfBirth)} /></label>
      <label className="field"><span>Contact number</span><input name="phone" type="tel" defaultValue={m?.phone ?? ""} /></label>
      <label className="field"><span>Email</span><input name="email" type="email" defaultValue={m?.email ?? ""} /></label>
      <label className="field sm:col-span-2 lg:col-span-3"><span>Address (blank = family address)</span><input name="address" defaultValue={m?.address ?? ""} /></label>
    </>
  );
}

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const family = await db.family.findFirst({
    where: { id, masjidId: user.masjidId },
    include: { members: { orderBy: [{ status: "asc" }, { memberCode: "asc" }], include: { user: { select: { id: true, passwordHash: true, isActive: true } } } } },
  });
  if (!family) notFound();
  const inactive = family.status === "INACTIVE";

  return (
    <>
      <PageHeader title={family.familyName}
        subtitle={`${family.familyCode} · Registered ${fmtDate(family.registrationDate)}`}
        actions={<>
          <Link href="/admin/families" className="btn-outline">All families</Link>
          <form action={setFamilyStatus}>
            <input type="hidden" name="id" value={family.id} />
            <input type="hidden" name="status" value={inactive ? "ACTIVE" : "INACTIVE"} />
            <ConfirmButton className={inactive ? "btn-outline" : "btn-danger"} message={inactive ? "Reactivate this family?" : "Deactivate this family and all its members?"}>
              {inactive ? "Reactivate family" : "Deactivate family"}
            </ConfirmButton>
          </form>
        </>} />

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-2"><h2 className="font-semibold">Family details</h2><StatusBadge status={family.status} /></div>
        <ActionForm action={updateFamily} className="card grid gap-4 sm:grid-cols-2" submit="Save details">
          <input type="hidden" name="id" value={family.id} />
          <FamilyFields f={family} />
        </ActionForm>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-2">Members ({family.members.length})</h2>
        <div className="space-y-2">
          {family.members.map((m) => {
            const isHead = family.headMemberId === m.id;
            const account = !m.user ? "No account" : m.user.passwordHash ? (m.user.isActive ? "Portal active" : "Account disabled") : "Invite pending";
            return (
              <details key={m.id} className="card p-0 group">
                <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 cursor-pointer list-none">
                  <span className="font-mono text-xs text-stone-500">{m.memberCode}</span>
                  <span className="font-medium">{m.fullName}</span>
                  <span className="text-sm text-stone-600">{m.relationship}</span>
                  {isHead && <span className="badge bg-amber-100 text-amber-800">Head</span>}
                  <StatusBadge status={m.status} />
                  <span className="text-xs text-stone-500 ml-auto">{m.phone ?? ""} · {account}</span>
                </summary>
                <div className="border-t border-stone-200 p-4 space-y-4">
                  <ActionForm action={saveMember} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" submit="Save member">
                    <MemberFields m={m} familyId={family.id} />
                  </ActionForm>
                  <div className="flex flex-wrap gap-2 items-start border-t border-stone-100 pt-3">
                    {!isHead && m.status === "ACTIVE" && (
                      <form action={setFamilyHead}><input type="hidden" name="memberId" value={m.id} /><button className="btn-outline">Make family head</button></form>
                    )}
                    <form action={setMemberStatus}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="status" value={m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                      <ConfirmButton className={m.status === "ACTIVE" ? "btn-danger" : "btn-outline"} message={`${m.status === "ACTIVE" ? "Deactivate" : "Reactivate"} ${m.fullName}?`}>
                        {m.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      </ConfirmButton>
                    </form>
                    {m.status === "ACTIVE" && (
                      <ActionForm action={inviteMember} className="flex-1 min-w-64 space-y-2" submit={m.user ? "Create password reset link" : "Invite to portal"} pendingLabel="Creating link…">
                        <input type="hidden" name="memberId" value={m.id} />
                      </ActionForm>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {!inactive && (
        <section>
          <h2 className="font-semibold mb-2">Add member</h2>
          <ActionForm action={saveMember} resetOnOk className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3" submit="Add member">
            <MemberFields familyId={family.id} />
          </ActionForm>
        </section>
      )}
    </>
  );
}
