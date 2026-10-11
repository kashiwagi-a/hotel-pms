import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { isIsoDate } from '@/lib/dates';
import { formatDateJa, yen } from '@/lib/format';
import { settlementTone, statusTone } from '@/lib/status';
import { isCancelled } from '@/lib/indicator';
import { canCheckIn, effectiveStatus, summarizeMoney } from '@/lib/settlement';
import { DatePicker } from '@/components/DatePicker';

export const dynamic = 'force-dynamic';

type Search = { q?: string; date?: string; status?: string; channel?: string; unassigned?: string };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const facility = await getCurrentFacility();
  const today = await getBusinessDate();
  const q = sp.q?.trim() ?? '';
  const date = sp.date && isIsoDate(sp.date) ? sp.date : '';

  const where: Prisma.ReservationWhereInput = { facilityId: facility.id };
  if (date) Object.assign(where, { arrival: { lte: date }, departure: { gt: date } });
  if (sp.status) where.status = sp.status;
  if (sp.channel) where.channel = sp.channel;
  if (q) where.OR = [{ guestName: { contains: q } }, { bookingNo: { contains: q } }, { phone: { contains: q } }];

  const [all, statuses, channels] = await Promise.all([
    prisma.reservation.findMany({
      where, orderBy: [{ arrival: 'desc' }, { bookedAt: 'desc' }], take: 1000,
      include: { payments: { select: { kind: true, source: true, amount: true, method: true } }, assignments: { include: { room: { select: { number: true } } } } },
    }),
    prisma.reservation.findMany({ where: { facilityId: facility.id }, distinct: ['status'], select: { status: true } }),
    prisma.reservation.findMany({ where: { facilityId: facility.id, channel: { not: null } }, distinct: ['channel'], select: { channel: true } }),
  ]);
  const rows = sp.unassigned
    ? all.filter((r) => !isCancelled(r.status) && !r.localCheckedOutAt && r.assignments.length < r.roomCount)
    : all;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>予約</h1>
          <div className="sub">{facility.name} ・ らく通から取り込んだ予約 {rows.length} 件{all.length >= 1000 ? '（先頭 1,000 件まで）' : ''}</div>
        </div>
        <Link className="btn" href="/import">らく通 CSV を取り込む</Link>
      </div>

      <form className="card card-pad row" style={{ alignItems: 'flex-end' }} action="/reservations">
        <div className="field">宿泊日<DatePicker name="date" value={date} today={today} allowEmpty autoSubmit ariaLabel="宿泊日" placeholder="指定なし" /></div>
        <label className="field">区分
          <select className="input" name="status" defaultValue={sp.status ?? ''}>
            <option value="">すべて</option>
            {statuses.map((s) => <option key={s.status} value={s.status}>{s.status}</option>)}
          </select>
        </label>
        <label className="field">エージェント
          <select className="input" name="channel" defaultValue={sp.channel ?? ''}>
            <option value="">すべて</option>
            {channels.map((c) => <option key={c.channel} value={c.channel!}>{c.channel}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>検索<input className="input" type="search" name="q" defaultValue={q} placeholder="お客様名・予約番号・電話番号" /></label>
        <label className="row" style={{ fontSize: 13, minHeight: 40 }}><input type="checkbox" name="unassigned" value="1" defaultChecked={!!sp.unassigned} />部屋割りが済んでいない予約だけ</label>
        <button className="btn primary" type="submit">絞り込み</button>
        <Link className="btn" href="/reservations">解除</Link>
      </form>

      <div className="card">
        {rows.length === 0 ? (
          <div className="card-pad sub">該当する予約がありません。</div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>状態</th><th>チェックイン</th><th>チェックアウト</th><th className="num">泊</th><th className="num">人数</th>
                  <th>室タイプ</th><th>部屋</th><th>お客様名</th><th>エージェント</th><th>決済方法</th>
                  <th className="num">金額</th><th className="num">未収</th><th className="num">預り金</th><th>予約番号</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const money = summarizeMoney(r, r.payments);
                  const status = effectiveStatus(r);
                  const cancelled = isCancelled(r.status);
                  const assigned = r.assignments.map((a) => a.room.number).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
                  const needRooms = !cancelled && !r.localCheckedOutAt && assigned.length < r.roomCount;
                  return (
                    <tr key={r.id} style={cancelled ? { color: 'var(--muted)' } : undefined}>
                      <td><span className={`tag ${statusTone(status)}`}>{status}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateJa(r.arrival)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateJa(r.departure)}</td>
                      <td className="num">{r.nights ?? '—'}</td>
                      <td className="num">{r.pax ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.roomTypeCode && <b>{r.roomTypeCode} </b>}{r.roomType ?? '—'}{r.roomCount > 1 ? ` ×${r.roomCount}` : ''}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {assigned.length > 0 && <b>{assigned.join('・')}</b>}
                        {needRooms && <span className="tag warn" style={{ marginLeft: assigned.length ? 6 : 0 }}>未割当 {r.roomCount - assigned.length}</span>}
                      </td>
                      <td><Link href={`/reservations/${r.id}`}>{r.guestName}</Link>{r.memo && <span className="tag warn" style={{ marginLeft: 6 }}>メモ</span>}</td>
                      <td>{r.channel ?? '—'}</td>
                      <td><span className={`tag ${settlementTone(!money.prepaidOnline, money.remaining)}`}>{r.settlement ?? '—'}</span></td>
                      <td className="num">{yen(r.totalAmount)}</td>
                      <td className="num" style={{ color: money.remaining > 0 ? 'var(--warn-fg)' : undefined, fontWeight: money.remaining > 0 ? 700 : undefined }}>{yen(money.remaining)}</td>
                      <td className="num" style={{ color: money.depositBalance ? 'var(--info-fg)' : 'var(--muted)' }}>{money.depositBalance ? yen(money.depositBalance) : '—'}</td>
                      <td className="sub" style={{ whiteSpace: 'nowrap' }}>{r.bookingNo ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {needRooms && r.arrival && <Link className="btn small" href={`/indicator?date=${r.arrival < today && r.departure! > today ? today : r.arrival}`}>部屋割り</Link>}
                        {canCheckIn(r, today, assigned.length).ok && <Link className="btn small primary" href={`/reservations/${r.id}?checkin=1`}>チェックイン精算</Link>}
                        {status === '滞在中' && <Link className="btn small" href={`/reservations/${r.id}?deposit=1`}>預り金</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
