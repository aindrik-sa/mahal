import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PrintButton } from "./print-button";

/** Printable generated certificate. Caller must check access. */
export async function Certificate({ applicationId, masjidId }: { applicationId: string; masjidId: string }) {
  const app = await db.application.findFirst({
    where: { id: applicationId, masjidId, status: { in: ["CERTIFICATE_READY", "COMPLETED"] }, certificateText: { not: null } },
    include: { masjid: true, form: { select: { name: true } }, history: { where: { to: "CERTIFICATE_READY" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!app) return <div className="card text-sm">Certificate not available.</div>;
  const issued = app.history[0]?.createdAt ?? app.updatedAt;
  return (
    <div className="max-w-3xl">
      <div className="flex justify-end mb-3 print:hidden"><PrintButton /></div>
      <div className="bg-white border-4 border-double border-emerald-800 p-8 sm:p-12 print:border-emerald-800">
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-emerald-900">{app.masjid.name}</div>
          {app.masjid.address && <div className="text-sm text-stone-600">{app.masjid.address}</div>}
          <div className="mt-6 text-lg font-semibold uppercase tracking-widest">{app.form.name}</div>
        </div>
        <div className="flex justify-between text-sm mt-6">
          <span>Certificate No: <b className="font-mono">{app.certificateNo}</b></span>
          <span>Date: {fmtDate(issued)}</span>
        </div>
        <p className="mt-8 leading-8 text-[15px] whitespace-pre-line">{app.certificateText}</p>
        <div className="grid grid-cols-2 gap-8 mt-16 text-sm text-center">
          <div className="border-t border-stone-400 pt-2">Secretary</div>
          <div className="border-t border-stone-400 pt-2">President</div>
        </div>
        <p className="text-xs text-stone-500 mt-10 text-center">Application {app.appCode}. Verify this certificate with the Mahall office using the certificate number.</p>
      </div>
    </div>
  );
}
