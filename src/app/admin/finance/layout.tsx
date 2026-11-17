import { NavLinks } from "@/components/nav-links";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="-mx-2 mb-4 [&_nav]:md:flex-row [&_nav]:border-b [&_nav]:border-stone-200">
        <NavLinks items={[{ href: "/admin/finance", label: "Overview", exact: true }, { href: "/admin/finance/income", label: "Income" }, { href: "/admin/finance/expenses", label: "Expenses" }]} />
      </div>
      {children}
    </>
  );
}
