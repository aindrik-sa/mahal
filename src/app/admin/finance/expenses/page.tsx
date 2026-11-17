import { requireAdmin } from "@/lib/auth";
import { Ledger } from "../ledger";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  return <Ledger kind="expense" masjidId={user.masjidId} sp={await searchParams} />;
}
