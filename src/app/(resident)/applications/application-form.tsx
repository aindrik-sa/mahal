import type { Answers, FieldSnap } from "@/lib/applications";
import { ActionForm } from "@/components/action-form";
import { FormRenderer } from "@/components/form-renderer";
import { saveApplication } from "./actions";

type FileRef = { id: string; fieldId: string | null; originalName: string };

export function ApplicationForm({ formId, appId, fields, answers, files, resubmit }: {
  formId: string; appId?: string; fields: FieldSnap[]; answers: Answers; files: FileRef[]; resubmit?: boolean;
}) {
  return (
    <ActionForm action={saveApplication} className="card grid gap-4">
      <input type="hidden" name="formId" value={formId} />
      {appId && <input type="hidden" name="id" value={appId} />}
      <FormRenderer fields={fields} answers={answers} files={files} />
      <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        <button className="btn" name="intent" value="submit">{resubmit ? "Resubmit application" : "Submit application"}</button>
        <button className="btn-outline" name="intent" value="draft" formNoValidate>Save draft</button>
      </div>
    </ActionForm>
  );
}
