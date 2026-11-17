"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";

export type ActionResult = { error?: string; ok?: string; link?: string } | undefined;

export function ActionForm({ action, children, className, resetOnOk, submit, pendingLabel }: {
  action: (s: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode; className?: string; resetOnOk?: boolean; submit?: string; pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  // Submit via onSubmit instead of the action prop: React 19 resets forms after an action,
  // which would wipe the user's input when the server returns a validation error.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Include the clicked submit button's name/value (e.g. intent=draft vs intent=submit).
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter?.form === e.currentTarget ? submitter : undefined);
    startTransition(() => formAction(fd));
  };
  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children}
      {state?.error && <p className="text-sm text-red-700 col-span-full">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-800 col-span-full">{state.ok}</p>}
      {state?.link && (
        <div className="col-span-full text-sm">
          <input readOnly value={state.link} className="input w-full font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <p className="text-xs text-stone-500 mt-1">Share this link with the resident (valid 7 days).</p>
        </div>
      )}
      {submit && <div className="col-span-full"><button className="btn" disabled={pending}>{pending ? pendingLabel ?? "Saving…" : submit}</button></div>}
    </form>
  );
}

export function ConfirmButton({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  return <button className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>;
}
