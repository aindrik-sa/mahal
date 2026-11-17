import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div><h1 className="h1">{title}</h1>{subtitle && <p className="text-sm text-stone-600 mt-1">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="card h-full">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-xs text-stone-500 mt-1">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return <span className={`badge ${active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{active ? "Active" : status === "PREVIOUS" ? "Previous" : "Inactive"}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-stone-500 py-8 text-center">{children}</div>;
}

export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="card border-dashed text-sm text-stone-600">
      <div className="font-medium text-stone-800">{title}</div>
      Arrives in Phase {phase}.
    </div>
  );
}

export function Flash({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</div>;
}
