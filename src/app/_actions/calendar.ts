'use server';

import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { eachDay, monthRange } from '@/lib/dates';
import { isActive, staysOn } from '@/lib/occupancy';

export type DayCount = { arrivals: number; rooms: number };

/** カレンダーに出す、日ごとの到着件数と宿泊室数 */
export async function getCalendarCounts(month: string): Promise<Record<string, DayCount>> {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  const { from, to } = monthRange(month);
  const facility = await getCurrentFacility();
  const rs = (await prisma.reservation.findMany({
    where: { facilityId: facility.id, arrival: { lt: to }, departure: { gt: from } },
    select: { status: true, arrival: true, departure: true, roomCount: true },
  })).filter(isActive);
  const out: Record<string, DayCount> = {};
  for (const d of eachDay(from, to)) {
    const arrivals = rs.filter((r) => r.arrival === d).length;
    const rooms = rs.filter((r) => staysOn(r, d)).reduce((s, r) => s + r.roomCount, 0);
    if (arrivals || rooms) out[d] = { arrivals, rooms };
  }
  return out;
}
