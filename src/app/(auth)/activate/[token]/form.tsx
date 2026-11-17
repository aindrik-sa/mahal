"use client";
import { useActionState } from "react";
import { setPassword } from "../../actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPassword, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="field"><span>New password</span><input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label className="field"><span>Confirm password</span><input name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : "Activate account"}</button>
    </form>
  );
}
