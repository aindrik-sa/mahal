import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { importCsv } from "../actions";

const SAMPLE = `family_name,house_name,house_number,ward,address,full_name,gender,relationship,date_of_birth,phone,email
Kizhakkethil,Kizhakkethil House,55,Ward 2,"Kizhakkethil, Ward 2",Basheer,Male,Head,1975-06-01,+91 9847011111,
Kizhakkethil,Kizhakkethil House,55,Ward 2,,Suhara,Female,Wife,1980-02-14,,
Kizhakkethil,Kizhakkethil House,55,Ward 2,,Nihal,Male,Son,2008-09-30,,`;

export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Import members" subtitle="Upload a CSV with one row per member. Excel: File → Save As → CSV UTF-8."
        actions={<Link href="/admin/families" className="btn-outline">Back</Link>} />
      <ActionForm action={importCsv} className="card space-y-3 max-w-2xl" submit="Import" pendingLabel="Importing…">
        <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
      </ActionForm>
      <div className="card mt-4 max-w-2xl text-sm space-y-2">
        <p className="font-medium">Format</p>
        <p className="text-stone-600">Required columns: <code>family_name, full_name, gender, relationship</code>. Optional: <code>house_name, house_number, ward, address, date_of_birth (YYYY-MM-DD), phone, email</code>.</p>
        <p className="text-stone-600">Rows with the same house number and ward go into one family; an existing family with that house number is reused. Members already in the family (same name) are skipped. The row with relationship <code>Head</code> becomes the family head.</p>
        <pre className="bg-stone-100 rounded-lg p-3 overflow-x-auto text-xs">{SAMPLE}</pre>
      </div>
    </>
  );
}
