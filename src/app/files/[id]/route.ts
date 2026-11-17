import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/storage";

/**
 * Access-controlled download. Admins of the masjid can read any of its files;
 * a resident can read files of their own applications only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.masjidId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const f = await db.storedFile.findFirst({ where: { id, masjidId: user.masjidId }, include: { application: { select: { applicantId: true } } } });
  const isAdmin = user.role !== "RESIDENT";
  if (!f || (!isAdmin && f.application?.applicantId !== user.id)) return new Response("Not found", { status: 404 });
  const buf = await readStored(f.storageKey);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${f.originalName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
