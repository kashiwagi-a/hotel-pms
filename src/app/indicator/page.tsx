import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { addDays, diffDays, isIsoDate } from '@/lib/dates';
import { formatDateJa, yen } from '@/lib/format';
import { computeRoomState, isCancelled } from '@/lib/indicator';
import { freeRoomsFor } from '@/lib/assignment';
import { MAX_NEW_BOOKING_NIGHTS } from '@/lib/new-booking';
import { canCheckIn, canCheckOut, effectiveStatus, summarizeMoney } from '@/lib/settlement';
import { IndicatorBoard, type BoardFloor, type BoardRoom, type UnassignedBooking } from './IndicatorBoard';
import { DatePicker } from '@/components/DatePicker';

export const dynamic = 'force-dynamic';

export default async function IndicatorPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = await getBusinessDate();
  const date = sp.date && isIsoDate(sp.date) ? sp.date : today;
  const facility = await getCurrentFacility();

  const [rooms, assignments, staying, upcoming] = await Promise.all([
    prisma.room.findMany({ where: { facilityId: facility.id } }),
    // この日に関係する部屋割り（泊まる予約と、この日にチェックアウトする予約）
    prisma.roomAssignment.findMany({
      where: { room: { facilityId: facility.id }, reservation: { arrival: { lte: date }, departure: { gte: date } } },
      include: { reservation: { include: { payments: { select: { kind: true, source: true, amount: true, method: true } }, _count: { select: { assignments: true } } } } },
    }),
    // この日の夜に泊まる予約（部屋割りが必要なものを探す）
    prisma.reservation.findMany({
      where: { facilityId: facility.id, arrival: { lte: date }, departure: { gt: date }, localCheckedOutAt: null },
      include: { _count: { select: { assignments: true } } },
      orderBy: [{ arrival: 'asc' }, { bookedAt: 'asc' }],
    }),
    // この日より後に到着する部屋割り（新しい予約で何泊まで空いているかを出す）
    prisma.roomAssignment.findMany({
      where: { room: { facilityId: facility.id }, reservation: { arrival: { gt: date, lte: addDays(date, MAX_NEW_BOOKING_NIGHTS) } } },
      select: { roomId: true, reservation: { select: { arrival: true, status: true } } },
    }),
  ]);

  // 部屋ごとの、次のお客様の到着日
  const nextArrival = new Map<number, string>();
  for (const a of upcoming) {
    if (isCancelled(a.reservation.status) || !a.reservation.arrival) continue;
    const cur = nextArrival.get(a.roomId);
    if (!cur || a.reservation.arrival < cur) nextArrival.set(a.roomId, a.reservation.arrival);
  }

  // 部屋ごとの予約と状態
  const byRoom = new Map<number, typeof assignments>();
  for (const a of assignments) byRoom.set(a.roomId, [...(byRoom.get(a.roomId) ?? []), a]);

  const floorsMap = new Map<number, BoardFloor>();
  const sorted = [...rooms].sort((a, b) => b.floor - a.floor || a.number.localeCompare(b.number, 'ja', { numeric: true }));
  for (const room of sorted) {
    const list = (byRoom.get(room.id) ?? []).map((a) => ({ ...a.reservation, status: effectiveStatus(a.reservation) }));
    const { state, reservation: r } = computeRoomState(room.outOfOrder, list, date);
    // 今夜の予約とは別に、本日出発予定でまだ在室のお客様
    const leaving = list.find((x) => x.id !== r?.id && x.departure === date && x.status === '滞在中');
    const money = r ? summarizeMoney(r, r.payments) : null;
    // 今夜空いている部屋（空室・本日出発・早めにチェックアウト済み）には予約を作れる
    const freeTonight = !room.outOfOrder && (!r || r.departure === date || !!r.localCheckedOutAt) && date >= today;
    const next = nextArrival.get(room.id);
    const boardRoom: BoardRoom = {
      id: room.id,
      number: room.number,
      type: room.typeCode ? `${room.type}（${room.typeCode}）` : room.type,
      typeCode: room.typeCode,
      outOfOrder: room.outOfOrder,
      state,
      dot: !!r?.memo,
      reservationId: r?.id ?? null,
      guest: r?.guestName ?? null,
      bookingNo: r?.bookingNo ?? null,
      stay: r ? `${formatDateJa(r.arrival)} 〜 ${formatDateJa(r.departure)}（${r.nights ?? '?'} 泊）` : null,
      pax: r?.pax ?? null,
      roomCount: r?.roomCount ?? 1,
      bookedType: r ? `${r.roomType ?? '—'}${r.roomTypeCode ? `（${r.roomTypeCode}）` : ''}` : null,
      typeMismatch: !!r?.roomTypeCode && !!room.typeCode && r.roomTypeCode !== room.typeCode,
      channel: r?.channel ?? null,
      plan: r?.planName ?? null,
      settlement: r?.settlement ?? null,
      unpaid: money && money.remaining > 0 ? yen(money.remaining) : null,
      deposit: money && money.depositBalance > 0 ? yen(money.depositBalance) : null,
      advance: money && money.advanceBalance > 0 ? yen(money.advanceBalance) : null,
      canAdvance: !!r && !r.localCheckedInAt && !r.localCheckedOutAt,
      canBook: freeTonight,
      freeNights: freeTonight ? (next ? diffDays(date, next) : MAX_NEW_BOOKING_NIGHTS) : 0,
      capacity: room.capacity,
      memo: r?.memo ?? null,
      canCheckin: !!r && canCheckIn(r, today, r._count.assignments).ok,
      canDeposit: r?.status === '滞在中',
      canCheckout: !!r && canCheckOut(r).ok,
      canUnassign: !!r && !r.localCheckedInAt,
      dueOutGuest: leaving?.guestName ?? null,
    };
    const floor = floorsMap.get(room.floor) ?? { label: `${room.floor}F`, building: room.building, rooms: [] };
    floor.rooms.push(boardRoom);
    floorsMap.set(room.floor, floor);
  }
  const floors = [...floorsMap.values()];

  // 部屋割りが済んでいない予約と、割り当てられる空室
  const needRooms = staying.filter((r) => !isCancelled(r.status) && r._count.assignments < r.roomCount && r.arrival && r.departure);
  let unassigned: UnassignedBooking[] = [];
  if (needRooms.length > 0) {
    const minArr = needRooms.reduce((m, b) => (b.arrival! < m ? b.arrival! : m), needRooms[0].arrival!);
    const maxDep = needRooms.reduce((m, b) => (b.departure! > m ? b.departure! : m), needRooms[0].departure!);
    const around = await prisma.roomAssignment.findMany({
      where: { room: { facilityId: facility.id }, reservation: { arrival: { lt: maxDep }, departure: { gte: minArr } } },
      include: { reservation: true },
    });
    const busy = around.map((a) => ({ roomId: a.roomId, reservation: { ...a.reservation, arrival: a.reservation.arrival!, departure: a.reservation.departure! } }));
    unassigned = needRooms.map((r) => {
      const booking = { ...r, arrival: r.arrival!, departure: r.departure! };
      const free = freeRoomsFor(booking, rooms, busy);
      return {
        id: r.id,
        guest: r.guestName,
        arrival: formatDateJa(r.arrival),
        nights: r.nights ?? null,
        pax: r.pax ?? null,
        roomType: r.roomType ?? '—',
        roomTypeCode: r.roomTypeCode,
        roomCount: r.roomCount,
        assigned: r._count.assignments,
        channel: r.channel,
        memo: r.memo,
        sameTypeFree: free.filter((x) => !r.roomTypeCode || x.typeCode === r.roomTypeCode).map((x) => x.id),
        otherFree: free.filter((x) => r.roomTypeCode && x.typeCode !== r.roomTypeCode).map((x) => x.id),
      };
    });
  }

  // 予約作成のエージェント欄の候補（よく使うもの）
  const channels = (await prisma.reservation.groupBy({
    by: ['channel'], where: { facilityId: facility.id, channel: { not: null } }, _count: { _all: true }, orderBy: { _count: { channel: 'desc' } }, take: 8,
  })).map((c) => c.channel!);

  let latest: string | null = null;
  if (assignments.length === 0 && staying.length === 0) {
    const agg = await prisma.reservation.aggregate({ where: { facilityId: facility.id }, _max: { arrival: true } });
    latest = agg._max.arrival;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>インジケーター</h1>
          <div className="sub">{facility.name} ・ {floors.length} フロア ・ {rooms.length} 室 ・ {formatDateJa(date, true)} の夜の客室状態</div>
        </div>
        <form className="row" action="/indicator">
          <Link className="btn small" href={`/indicator?date=${addDays(date, -1)}`}>前日</Link>
          <DatePicker name="date" value={date} today={today} autoSubmit ariaLabel="表示する日" />
          <Link className="btn small" href={`/indicator?date=${addDays(date, 1)}`}>翌日</Link>
          {date !== today && <Link className="btn small" href="/indicator">営業日</Link>}
        </form>
      </div>

      {rooms.length === 0 ? (
        <div className="card card-pad stack">
          <h2>客室が登録されていません</h2>
          <p className="sub" style={{ margin: 0 }}>客室マスタに部屋を登録すると、インジケーターに表示されます。</p>
          <div className="row"><Link className="btn primary" href="/settings/rooms">客室マスタを開く</Link></div>
        </div>
      ) : (
        <>
          {latest && latest !== date && (
            <div className="notice warn">
              {formatDateJa(date, true)} に泊まる予約がありません。<Link href={`/indicator?date=${latest}`}>最新のチェックイン日（{formatDateJa(latest, true)}）を表示</Link>
            </div>
          )}
          <IndicatorBoard date={date} floors={floors} unassigned={unassigned} channels={channels} />
        </>
      )}
    </>
  );
}
