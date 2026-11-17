import { LoginForm } from "./form";

export default function LoginPage() {
  return (
    <>
      <h1 className="text-lg font-semibold mb-4">Sign in</h1>
      <LoginForm />
      <p className="text-xs text-stone-500 mt-4">Forgot your password? Contact the Mahall office for a reset link.</p>
    </>
  );
}
