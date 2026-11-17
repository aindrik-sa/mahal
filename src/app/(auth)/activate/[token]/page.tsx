import { SetPasswordForm } from "./form";

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="text-lg font-semibold mb-1">Set your password</h1>
      <p className="text-sm text-stone-600 mb-4">Choose a password to activate your Mahall account.</p>
      <SetPasswordForm token={token} />
    </>
  );
}
