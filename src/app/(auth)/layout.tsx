export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 bg-emerald-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-emerald-800">Mahall</div>
          <p className="text-sm text-stone-600">Masjid community portal</p>
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
