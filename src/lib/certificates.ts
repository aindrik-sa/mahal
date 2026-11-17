import "server-only";
import { db } from "./db";
import { fmtDate } from "./format";
import { renderTemplate, type Answers, type FieldSnap } from "./applications";

/** Pre-fills certificate text from the form template for the admin to review. Nothing is saved. */
export async function draftCertificateText(
  app: { answers: unknown; fieldsSnapshot: unknown; familyId: string | null; applicant: { name: string }; form: { certificateTemplate: string | null } },
  masjidName: string,
) {
  if (!app.form.certificateTemplate) return "";
  const family = app.familyId ? await db.family.findUnique({ where: { id: app.familyId }, select: { familyName: true, houseName: true } }) : null;
  return renderTemplate(app.form.certificateTemplate, (app.fieldsSnapshot ?? []) as FieldSnap[], app.answers as Answers, {
    applicant: app.applicant.name, family: family ? [family.familyName, family.houseName].filter(Boolean).join(", ") : "",
    date: fmtDate(new Date()), masjid: masjidName, certificate_no: "{{certificate_no}}",
  });
}
