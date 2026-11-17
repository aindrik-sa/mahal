import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { runSubscriptionReminders } from "@/lib/notify";

/**
 * Daily job for automated subscription reminders. Call from any scheduler:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reminders
 * Reminders also run whenever an admin opens the dashboard, so this is a backstop.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret)))
    return new Response("Unauthorized", { status: 401 });
  const masjids = await db.masjid.findMany({ select: { id: true } });
  let sent = 0;
  for (const m of masjids) sent += await runSubscriptionReminders(m.id);
  return Response.json({ ok: true, notificationsSent: sent });
}
