/**
 * 部屋割り（アサイン）のルール
 * - 1 つの予約には、室数の分だけ部屋を割り当てる
 * - 部屋は、泊まる期間（チェックイン日〜チェックアウト日の前日）がほかの予約と重ならないときだけ空いている
 * - 故障の部屋には割り当てない
 */
import { isCancelled } from './indicator';

export type StayRange = { arrival: string; departure: string };

/** 2 つの滞在期間が重なるか（チェックアウト日とチェックイン日が同じなら重ならない） */
export function overlaps(a: StayRange, b: StayRange): boolean {
  return a.arrival < b.departure && b.arrival < a.departure;
}

export type RoomLike = { id: number; number: string; floor: number; typeCode: string | null; outOfOrder: boolean };
export type BookingLike = {
  id: number;
  status: string;
  arrival: string;
  departure: string;
  roomTypeCode: string | null;
  localCheckedOutAt?: Date | null;
};
export type AssignmentLike = { roomId: number; reservation: BookingLike };

/** チェックアウト済みの予約は、チェックアウトした日以降は部屋を使わない（早いチェックアウトに対応） */
export function occupiedRange(b: BookingLike): StayRange {
  if (!b.localCheckedOutAt) return b;
  const out = new Date(b.localCheckedOutAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { arrival: b.arrival, departure: out < b.departure ? out : b.departure };
}

/**
 * 予約の期間に空いている部屋。並び順は、タイプが一致する部屋 → 到着日に前のお客様が出発しない部屋
 * （清掃待ちにならない部屋）→ 低い階 → 部屋番号の小さい順。
 */
export function freeRoomsFor(
  booking: BookingLike,
  rooms: RoomLike[],
  assignments: AssignmentLike[],
  opts: { sameTypeOnly?: boolean } = {},
): RoomLike[] {
  const others = assignments.filter((a) => a.reservation.id !== booking.id && !isCancelled(a.reservation.status));
  const busy = new Set(others.filter((a) => overlaps(occupiedRange(a.reservation), booking)).map((a) => a.roomId));
  // 到着日に前のお客様が出発する部屋（同じ日の入れ替え）
  const turnover = new Set(others.filter((a) => occupiedRange(a.reservation).departure === booking.arrival).map((a) => a.roomId));
  return rooms
    .filter((r) => !r.outOfOrder && !busy.has(r.id))
    .filter((r) => !opts.sameTypeOnly || !booking.roomTypeCode || r.typeCode === booking.roomTypeCode)
    .sort((a, b) => {
      const ta = a.typeCode === booking.roomTypeCode ? 0 : 1;
      const tb = b.typeCode === booking.roomTypeCode ? 0 : 1;
      const ua = turnover.has(a.id) ? 1 : 0;
      const ub = turnover.has(b.id) ? 1 : 0;
      return ta - tb || ua - ub || a.floor - b.floor || a.number.localeCompare(b.number, 'ja', { numeric: true });
    });
}

/**
 * 自動アサインの割り当て案を作る。
 * チェックイン日が早い順・受信が早い順に、タイプが一致する空室を部屋番号の小さい順に割り当てる。
 * 複数室の予約は、できるだけ同じ階にまとめる。タイプの合う空室が足りない予約は残す。
 */
export function planAutoAssign(
  bookings: (BookingLike & { roomCount: number; assigned: number; bookedAt?: Date | null })[],
  rooms: RoomLike[],
  assignments: AssignmentLike[],
): { reservationId: number; roomId: number }[] {
  const plan: { reservationId: number; roomId: number }[] = [];
  const working = [...assignments];
  const order = [...bookings].sort((a, b) =>
    a.arrival.localeCompare(b.arrival) || (a.bookedAt?.getTime() ?? 0) - (b.bookedAt?.getTime() ?? 0) || a.id - b.id);
  for (const b of order) {
    const need = b.roomCount - b.assigned;
    if (need <= 0 || isCancelled(b.status)) continue;
    const free = freeRoomsFor(b, rooms, working, { sameTypeOnly: true });
    if (free.length < need) continue;
    // 同じ階でそろう階があればそこを使う
    const byFloor = new Map<number, RoomLike[]>();
    for (const r of free) byFloor.set(r.floor, [...(byFloor.get(r.floor) ?? []), r]);
    const floor = [...byFloor.entries()].find(([, list]) => list.length >= need);
    const chosen = floor ? floor[1].slice(0, need) : free.slice(0, need);
    for (const r of chosen) {
      plan.push({ reservationId: b.id, roomId: r.id });
      working.push({ roomId: r.id, reservation: b });
    }
  }
  return plan;
}
