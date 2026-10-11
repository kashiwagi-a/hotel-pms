import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { isIsoDate, todayJst } from '@/lib/dates';
import { formatDateJa, yen } from '@/lib/format';
import { settlementTone, statusTone } from '@/lib/status';
import { canCheckIn, effectiveStatus, summarizeMoney } from '@/lib/settlement';

export const dynamic = 'force-dynamic';

type Search = { q?: string; date?: string; status?: string; channel?: string };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const facility = await getCurrentFacility();
  const q = sp.q?.trim() ?? '';
  const date = sp.date && isIsoDate(sp.date) ? sp.date : '';

  const where: Prisma.ReservationWhereInput = { facilityId: facility.id };
  if (date) Object.assign(where, { arrival: { lte: date }, departure: { gte: date } });
  if (sp.status) where.status = sp.status;
  if (sp.channel) where.channel = sp.channel;
  if (q) {
    where.OR = [
      { guestName: { contains: q } },
      { bookingNo: { contains: q } },
      { roomNumber: { contains: q } },
      { phone: { contains: q } },
    ];
  }

  const [rows, total, statuses, channels] = await Promise.all([
    prisma.reservation.findMany({ where, orderBy: [{ arrival: 'desc' }, { roomNumber: 'asc' }], take: 500, include: { payments: { select: { kind: true, source: true, amount: true } } } }),
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({ where: { facilityId: facility.id }, distinct: ['status'], select: { status: true } }),
    prisma.reservation.findMany({ where: { facilityId: facility.id, channel: { not: null } }, distinct: ['channel'], select: { channel: true } }),
  ]);

  const today = todayJst();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>予約</h1>
          <div className="sub">{facility.name} ・ らく通から取り込んだ予約 {total} 件{total > rows.length ? `（先頭 ${rows.length} 件を表示）` : ''}</div>
        </div>
        <Link className="btn" href="/import">らく通 CSV を取り込む</Link>
      </div>

      <form className="card card-pad row" style={{ alignItems: 'flex-end' }} action="/reservations">
        <label className="field">滞在日<input className="input" type="date" name="date" defaultValue={date} /></label>
        <label className="field">ステータス
          <select className="input" name="status" defaultValue={sp.status ?? ''}>
            <option value="">すべて</option>
            {statuses.map((s) => <option key={s.status} value={s.status}>{s.status}</option>)}
          </select>
        </label>
        <label className="field">販売経路
          <select className="input" name="channel" defaultValue={sp.channel ?? ''}>
            <option value="">すべて</option>
            {channels.map((c) => <option key={c.channel} value={c.channel!}>{c.channel}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>検索<input className="input" type="search" name="q" defaultValue={q} placeholder="氏名・予約番号・部屋番号・電話番号" /></label>
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
                  <th>部屋</th><th>宿泊者</th><th>到着</th><th>出発</th><th className="num">泊</th><th className="num">人数</th>
                  <th>販売経路</th><th>決済</th><th className="num">合計</th><th className="num">受領済</th><th className="num">未収</th><th className="num">預り金</th><th>ステータス</th><th>予約番号</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const money = summarizeMoney(r, r.payments);
                  const status = effectiveStatus(r);
                  const received = money.receivedImport + money.paidHere;
                  return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{r.roomNumber ?? '—'}</b> <span className="sub">{r.roomType}</span></td>
                    <td><Link href={`/reservations/${r.id}`}>{r.guestName}</Link>{r.groupCode && <span className="tag" style={{ marginLeft: 6 }}>{r.groupCode}</span>}{r.frontNote && <span className="tag warn" style={{ marginLeft: 6 }}>備考</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateJa(r.arrival)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateJa(r.departure)}</td>
                    <td className="num">{r.nights ?? '—'}</td>
                    <td className="num">{r.pax ?? '—'}</td>
                    <td>{r.channel ?? '—'}</td>
                    <td><span className={`tag ${settlementTone(r.settlement, money.remaining)}`}>{r.settlement ?? '—'}</span></td>
                    <td className="num">{yen(r.totalAmount)}</td>
                    <td className="num">{yen(received)}</td>
                    <td className="num" style={{ color: money.remaining > 0 ? 'var(--warn-fg)' : undefined, fontWeight: money.remaining > 0 ? 700 : undefined }}>{yen(money.remaining)}</td>
                    <td className="num" style={{ color: money.depositBalance ? 'var(--info-fg)' : 'var(--muted)' }}>{money.depositBalance ? yen(money.depositBalance) : '—'}</td>
                    <td><span className={`tag ${statusTone(status)}`}>{status}</span></td>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{r.bookingNo ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canCheckIn(r, today).ok && <Link className="btn small primary" href={`/reservations/${r.id}?checkin=1`}>チェックイン精算</Link>}
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
