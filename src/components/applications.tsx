import type { ApplicationStatus } from "@prisma/client";
import { APP_STATUS_LABEL, APP_STATUS_STYLE, displayAnswer, type Answers, type FieldSnap } from "@/lib/applications";
import { fmtDateTime } from "@/lib/format";

export function AppStatusBadge({ s }: { s: ApplicationStatus }) {
  return <span className={`badge ${APP_STATUS_STYLE[s]}`}>{APP_STATUS_LABEL[s]}</span>;
}

type FileRef = { id: string; fieldId: string | null; originalName: string; size: number; mimeType: string };

export function AnswersView({ fields, answers, files }: { fields: FieldSnap[]; answers: Answers; files: FileRef[] }) {
  return (
    <dl className="grid sm:grid-cols-[minmax(10rem,auto)_1fr] gap-x-6 gap-y-2 text-sm">
      {fields.map((f) => (
        <div key={f.id} className="contents">
          <dt className="text-stone-500">{f.label}</dt>
          <dd className="whitespace-pre-line">
            {f.type === "FILE" ? (
              files.filter((x) => x.fieldId === f.id).map((x) => (
                <a key={x.id} href={`/files/${x.id}?inline=1`} target="_blank" rel="noopener noreferrer" className="block text-emerald-800 hover:underline">
                  {x.originalName} <span className="text-xs text-stone-500">({Math.ceil(x.size / 1024)} KB)</span>
                </a>
              ))
            ) : displayAnswer(f, answers[f.id])}
            {f.type === "FILE" && !files.some((x) => x.fieldId === f.id) && "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Hist = { id: string; to: ApplicationStatus; note: string | null; createdAt: Date; byUser: { name: string } | null };

export function HistoryTimeline({ history }: { history: Hist[] }) {
  return (
    <ol className="relative border-l border-stone-200 ml-2 space-y-4">
      {history.map((h) => (
        <li key={h.id} className="ml-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-emerald-600" />
          <div className="flex flex-wrap items-center gap-2 text-sm"><AppStatusBadge s={h.to} /><span className="text-xs text-stone-500">{fmtDateTime(h.createdAt)}{h.byUser && ` · ${h.byUser.name}`}</span></div>
          {h.note && <p className="text-sm text-stone-700 mt-1 whitespace-pre-line">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}
