import type { FieldSnap, Answers } from "@/lib/applications";

type FileRef = { id: string; fieldId: string | null; originalName: string };

/** Renders dynamic form fields as plain inputs (names f_<id> / file_<id>). Server-renderable. */
export function FormRenderer({ fields, answers, files }: { fields: FieldSnap[]; answers: Answers; files: FileRef[] }) {
  return (
    <>
      {fields.map((f) => {
        const name = `f_${f.id}`;
        const v = answers[f.id];
        const label = <span>{f.label}{f.required && " *"}</span>;
        const help = f.helpText && f.type !== "DECLARATION" ? <span className="text-xs font-normal text-stone-500">{f.helpText}</span> : null;
        switch (f.type) {
          case "TEXTAREA":
            return <label key={f.id} className="field">{label}<textarea name={name} rows={3} defaultValue={typeof v === "string" ? v : ""} />{help}</label>;
          case "NUMBER":
          case "DATE":
          case "TEXT":
            return <label key={f.id} className="field">{label}<input name={name} type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"} step="any" defaultValue={typeof v === "string" ? v : ""} />{help}</label>;
          case "SELECT":
            return (
              <label key={f.id} className="field">{label}
                <select name={name} defaultValue={typeof v === "string" ? v : ""}><option value="">Select…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>{help}
              </label>
            );
          case "RADIO":
          case "CHECKBOX":
            return (
              <fieldset key={f.id} className="field"><legend className="text-sm font-medium text-stone-700 mb-1">{f.label}{f.required && " *"}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {f.options.map((o) => (
                    <label key={o} className="flex items-center gap-1.5">
                      <input type={f.type === "RADIO" ? "radio" : "checkbox"} name={name} value={o} defaultChecked={f.type === "RADIO" ? v === o : Array.isArray(v) && v.includes(o)} />{o}
                    </label>
                  ))}
                </div>{help}
              </fieldset>
            );
          case "FILE": {
            const mine = files.filter((x) => x.fieldId === f.id);
            return (
              <label key={f.id} className="field">{label}
                {mine.length > 0 && <span className="text-xs font-normal text-emerald-800">Attached: {mine.map((x) => x.originalName).join(", ")}</span>}
                <input type="file" name={`file_${f.id}`} accept="application/pdf,image/jpeg,image/png" multiple className="text-sm" />
                <span className="text-xs font-normal text-stone-500">{f.helpText ? `${f.helpText} · ` : ""}PDF, JPG or PNG, up to 5 MB each.</span>
              </label>
            );
          }
          case "DECLARATION":
            return (
              <label key={f.id} className="flex items-start gap-2 text-sm rounded-lg border border-stone-200 p-3 bg-stone-50">
                <input type="checkbox" name={name} defaultChecked={v === true} className="mt-0.5" />
                <span><span className="font-medium">{f.label}{f.required && " *"}</span>{f.helpText && <span className="block text-stone-600">{f.helpText}</span>}</span>
              </label>
            );
        }
      })}
    </>
  );
}
