import type { Family } from "@prisma/client";

export function FamilyFields({ f }: { f?: Family }) {
  return (
    <>
      <label className="field"><span>Family name *</span><input name="familyName" defaultValue={f?.familyName} required /></label>
      <label className="field"><span>House name</span><input name="houseName" defaultValue={f?.houseName ?? ""} /></label>
      <label className="field"><span>House number</span><input name="houseNumber" defaultValue={f?.houseNumber ?? ""} /></label>
      <label className="field"><span>Ward / Area</span><input name="ward" defaultValue={f?.ward ?? ""} /></label>
      <label className="field sm:col-span-2"><span>Residential address</span><input name="address" defaultValue={f?.address ?? ""} /></label>
      <label className="field"><span>Primary contact</span><input name="primaryPhone" type="tel" defaultValue={f?.primaryPhone ?? ""} /></label>
      <label className="field"><span>Secondary contact</span><input name="secondaryPhone" type="tel" defaultValue={f?.secondaryPhone ?? ""} /></label>
    </>
  );
}
