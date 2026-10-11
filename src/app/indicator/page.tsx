import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { addDays, diffDays, isIsoDate, todayJst } from '@/lib/dates';
import { formatDateJa, yen } from '@/lib/format';
import { computeRoomState } from '@/lib/indicator';
import { canCheckIn, effectiveStatus, summarizeMoney } from '@/lib/settlement';
import { IndicatorBoard, type BoardFloor } from './IndicatorBoard';

export const dynamic = 'force-dynamic';

export default async function IndicatorPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = todayJst();
  const date = sp.date && isIsoDate(sp.date) ? sp.date : today;
  const facility = await getCurrentFacility();

  const [rooms, reservations] = await Promise.all([
    prisma.room.findMany({ where: { facilityId: facility.id } }),
    prisma.reservation.findMany({
      where: { facilityId: facility.id, roomId: { not: null }, arrival: { lte: date }, departure: { gte: date } },
      include: { payments: { select: { kind: true, source: true, amount: true } } },
    }),
  ]);

  // この画面でチェックインした予約は「滞在中」として状態を判定する
  const withStatus = reservations.map((r) => ({ ...r, status: effectiveStatus(r) }));
  const byRoom = new Map<number, typeof withStatus>();
  for (const r of withStatus) {
    const list = byRoom.get(r.roomId!) ?? [];
    list.push(r);
    byRoom.set(r.roomId!, list);
  }

  const floorsMap = new Map<number, BoardFloor>();
  const sorted = [...rooms].sort((a, b) => b.floor - a.floor || a.number.localeCompare(b.number, 'ja', { numeric: true }));
  for (const room of sorted) {
    const { state, reservation: r } = computeRoomState(room.outOfOrder, byRoom.get(room.id) ?? [], date);
    const money = r ? summarizeMoney(r, r.payments) : null;
    const floor = floorsMap.get(room.floor) ?? { label: `${room.floor}F`, building: room.building, rooms: [] };
    floor.rooms.push({
      id: room.id,
      number: room.number,
      type: room.typeCode ? `${room.type}（${room.typeCode}）` : room.type,
      state,
      dot: !!r?.frontNote,
      reservationId: r?.id ?? null,
      guest: r?.guestName ?? null,
      bookingNo: r?.bookingNo ?? null,
      stay: r ? `${formatDateJa(r.arrival)} 〜 ${formatDateJa(r.departure)}（${r.nights ?? (r.arrival && r.departure ? diffDays(r.arrival, r.departure) : '?')} 泊）` : null,
      pax: r?.pax ?? null,
      channel: r?.channel ?? null,
      plan: r ? [r.mealPlan, r.settlement].filter(Boolean).join(' ・ ') || null : null,
      unpaid: money && money.remaining > 0 ? yen(money.remaining) : null,
      deposit: money && money.depositBalance > 0 ? yen(money.depositBalance) : null,
      canCheckin: !!r && canCheckIn(r, today).ok,
      canDeposit: r?.status === '滞在中',
      note: r?.frontNote ?? null,
      groupCode: r?.groupCode ?? null,
    });
    floorsMap.set(room.floor, floor);
  }
  const floors = [...floorsMap.values()];

  // 表示日に予約が 1 件も無いときは、データのある日付へ案内する
  let latest: string | null = null;
  if (reservations.length === 0) {
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
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="sr-only">営業日</span>
            <input className="input" type="date" name="date" defaultValue={date} aria-label="営業日" />
          </label>
          <button className="btn small" type="submit">表示</button>
          <Link className="btn small" href={`/indicator?date=${addDays(date, 1)}`}>翌日</Link>
          {date !== today && <Link className="btn small" href="/indicator">今日</Link>}
        </form>
      </div>

      {rooms.length === 0 ? (
        <div className="card card-pad stack">
          <h2>客室が登録されていません</h2>
          <p className="sub" style={{ margin: 0 }}>客室マスタに部屋を登録するか、らく通の CSV を取り込むと、CSV にある部屋が自動で登録されます。</p>
          <div className="row">
            <Link className="btn primary" href="/settings/rooms">客室マスタを開く</Link>
            <Link className="btn" href="/import">らく通 CSV を取り込む</Link>
          </div>
        </div>
      ) : (
        <>
          {latest && latest !== date && (
            <div className="notice warn">
              {formatDateJa(date, true)} に泊まる予約がありません。<Link href={`/indicator?date=${latest}`}>最新の到着日（{formatDateJa(latest, true)}）を表示</Link>
            </div>
          )}
          <IndicatorBoard floors={floors} />
        </>
      )}
    </>
  );
}
