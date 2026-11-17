import { db } from "./db";
import type { Prisma } from "@prisma/client";

export async function audit(
  user: { id: string; masjidId: string },
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  data?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({ data: { masjidId: user.masjidId, userId: user.id, action, entityType, entityId, summary, data } });
}
