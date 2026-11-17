import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { FamilyFields } from "../family-fields";
import { createFamily } from "../actions";

export default async function NewFamilyPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Add family" subtitle="A Family ID is generated automatically." actions={<Link href="/admin/families" className="btn-outline">Cancel</Link>} />
      <ActionForm action={createFamily} className="card grid gap-4 sm:grid-cols-2 max-w-3xl" submit="Create family">
        <FamilyFields />
        <div className="col-span-full border-t border-stone-200 pt-3 text-sm font-medium">Family head</div>
        <label className="field"><span>Head full name *</span><input name="headName" required /></label>
        <label className="field"><span>Gender</span><select name="headGender"><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
      </ActionForm>
    </>
  );
}
