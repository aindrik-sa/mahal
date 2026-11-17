import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { updateContact, changePassword } from "./actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const member = user.memberId
    ? await db.member.findFirst({
        where: { id: user.memberId, masjidId: user.masjidId },
        include: { family: { include: { members: { where: { status: "ACTIVE" }, orderBy: { memberCode: "asc" }, select: { id: true, fullName: true, relationship: true, memberCode: true } } } } },
      })
    : null;

  return (
    <>
      <PageHeader title="My Profile" />
      <div className="grid lg:grid-cols-2 gap-4">
        {member ? (
          <section className="card">
            <h2 className="font-semibold mb-3">{member.fullName}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-stone-500">Member ID</dt><dd className="font-mono">{member.memberCode}</dd>
              <dt className="text-stone-500">Family ID</dt><dd className="font-mono">{member.family.familyCode}</dd>
              <dt className="text-stone-500">Family</dt><dd>{member.family.familyName}</dd>
              <dt className="text-stone-500">House</dt><dd>{[member.family.houseNumber, member.family.houseName].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-stone-500">Ward</dt><dd>{member.family.ward ?? "—"}</dd>
              <dt className="text-stone-500">Date of birth</dt><dd>{fmtDate(member.dateOfBirth)}</dd>
              <dt className="text-stone-500">Registered</dt><dd>{fmtDate(member.registrationDate)}</dd>
            </dl>
            <h3 className="font-medium text-sm mt-4 mb-1">Family members</h3>
            <ul className="text-sm divide-y divide-stone-100">
              {member.family.members.map((fm) => <li key={fm.id} className="py-1.5 flex justify-between"><span>{fm.fullName}</span><span className="text-stone-500">{fm.relationship}</span></li>)}
            </ul>
            <p className="text-xs text-stone-500 mt-3">To correct names, dates or family details, contact the Mahall office.</p>
          </section>
        ) : (
          <section className="card text-sm text-stone-600">This account is not linked to a member record.</section>
        )}
        <div className="space-y-4">
          {member && (
            <ActionForm action={updateContact} className="card grid gap-3" submit="Update contact">
              <h2 className="font-semibold">Contact details</h2>
              <label className="field"><span>Phone</span><input name="phone" type="tel" defaultValue={member.phone ?? ""} /></label>
              <label className="field"><span>Email</span><input name="email" type="email" defaultValue={member.email ?? ""} /></label>
            </ActionForm>
          )}
          <ActionForm action={changePassword} resetOnOk className="card grid gap-3" submit="Change password">
            <h2 className="font-semibold">Change password</h2>
            <label className="field"><span>Current password</span><input name="current" type="password" autoComplete="current-password" required /></label>
            <label className="field"><span>New password</span><input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
            <label className="field"><span>Confirm new password</span><input name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
