import type { ApplicationStatus, FieldType, FormCategory, FormField } from "@prisma/client";

export const FORM_CATEGORY_LABEL: Record<FormCategory, string> = {
  MARRIAGE_CERTIFICATE: "Marriage Certificate", MARRIAGE_REGISTRATION: "Marriage Registration Request",
  MEMBERSHIP_CERTIFICATE: "Membership Certificate", RESIDENCE_CERTIFICATE: "Residence / Mahall Membership Certificate", OTHER: "Other Certificate",
};

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  TEXT: "Short text", TEXTAREA: "Long text", NUMBER: "Number", DATE: "Date", SELECT: "Dropdown", RADIO: "Radio buttons",
  CHECKBOX: "Checkboxes", FILE: "File upload", DECLARATION: "Terms / declaration",
};
export const CHOICE_TYPES: FieldType[] = ["SELECT", "RADIO", "CHECKBOX"];

export const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", INFO_REQUIRED: "Additional information required",
  APPROVED: "Approved", REJECTED: "Rejected", CERTIFICATE_READY: "Certificate ready", COMPLETED: "Completed",
};
export const APP_STATUS_STYLE: Record<ApplicationStatus, string> = {
  DRAFT: "bg-stone-200 text-stone-700", SUBMITTED: "bg-sky-100 text-sky-800", UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  INFO_REQUIRED: "bg-amber-100 text-amber-800", APPROVED: "bg-emerald-100 text-emerald-800", REJECTED: "bg-red-100 text-red-800",
  CERTIFICATE_READY: "bg-emerald-600 text-white", COMPLETED: "bg-stone-700 text-white",
};

/** Admin-driven transitions. Residents only move DRAFT/INFO_REQUIRED → SUBMITTED. */
export const ADMIN_TRANSITIONS: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  SUBMITTED: ["UNDER_REVIEW", "INFO_REQUIRED", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["INFO_REQUIRED", "APPROVED", "REJECTED"],
  APPROVED: ["CERTIFICATE_READY", "REJECTED"],
  CERTIFICATE_READY: ["COMPLETED"],
};

export type FieldSnap = Pick<FormField, "id" | "label" | "type" | "required" | "options" | "helpText">;
export type Answers = Record<string, string | string[] | boolean>;

/** Reads answers for all non-file fields from a submitted form. Field inputs are named f_<fieldId>. */
export function readAnswers(fields: FieldSnap[], fd: FormData): Answers {
  const out: Answers = {};
  for (const f of fields) {
    const k = `f_${f.id}`;
    if (f.type === "FILE") continue;
    if (f.type === "CHECKBOX") out[f.id] = fd.getAll(k).map(String).filter((v) => f.options.includes(v));
    else if (f.type === "DECLARATION") out[f.id] = fd.get(k) === "on";
    else out[f.id] = String(fd.get(k) ?? "").trim().slice(0, f.type === "TEXTAREA" ? 4000 : 500);
  }
  return out;
}

/** Validation for final submission (drafts may be incomplete). fileCounts: files already attached per field. */
export function validateAnswers(fields: FieldSnap[], a: Answers, fileCounts: Record<string, number>): string | null {
  for (const f of fields) {
    const v = a[f.id];
    if (f.type === "FILE") {
      if (f.required && !fileCounts[f.id]) return `Upload: ${f.label}`;
      continue;
    }
    if (f.type === "DECLARATION") { if (f.required && v !== true) return `Please accept: ${f.label}`; continue; }
    if (f.type === "CHECKBOX") { if (f.required && !(Array.isArray(v) && v.length)) return `Choose at least one: ${f.label}`; continue; }
    const s = typeof v === "string" ? v : "";
    if (!s) { if (f.required) return `Required: ${f.label}`; continue; }
    if (f.type === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(s)) return `${f.label} must be a number`;
    if (f.type === "DATE" && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s).getTime()))) return `${f.label} must be a valid date`;
    if ((f.type === "SELECT" || f.type === "RADIO") && !f.options.includes(s)) return `Choose a valid option for ${f.label}`;
  }
  return null;
}

export function displayAnswer(f: FieldSnap, v: Answers[string] | undefined) {
  if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "—";
  if (f.type === "DECLARATION") return v === true ? "Accepted" : "Not accepted";
  if (f.type === "DATE" && typeof v === "string") return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return Array.isArray(v) ? v.join(", ") : String(v);
}

/** Fills {{placeholders}} in a certificate template. Unknown placeholders are left blank. */
export function renderTemplate(tpl: string, fields: FieldSnap[], a: Answers, extra: Record<string, string>) {
  const byLabel = new Map(fields.map((f) => [f.label.trim().toLowerCase(), displayAnswer(f, a[f.id])]));
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    const k = key.toLowerCase();
    return extra[k] ?? byLabel.get(k) ?? "";
  });
}
