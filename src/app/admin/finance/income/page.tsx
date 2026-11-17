import { requireAdmin } from "@/lib/auth";
import { Ledger } from "../ledger";

export default async function IncomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  return <Ledger kind="income" masjidId={user.masjidId} sp={await searchParams} />;
}
