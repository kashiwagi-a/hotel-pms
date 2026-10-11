import type { PrismaClient } from '@prisma/client';

/**
 * 取り込んだ予約から「室タイプの記号 → 名前」を集める。
 * 同じ記号に複数の名前があるときは、いちばん長い名前を使う（印字で途中が切れた名前より、完全な名前を優先）。
 */
export async function rakutsuTypeNames(prisma: PrismaClient, facilityId: number): Promise<Map<string, string>> {
  const rows = await prisma.reservation.findMany({
    where: { facilityId, roomTypeCode: { not: null }, roomType: { not: null } },
    distinct: ['roomTypeCode', 'roomType'],
    select: { roomTypeCode: true, roomType: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    const cur = map.get(r.roomTypeCode!);
    if (!cur || r.roomType!.length > cur.length) map.set(r.roomTypeCode!, r.roomType!);
  }
  return map;
}
