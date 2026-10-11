import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { addDays, isIsoDate } from '@/lib/dates';
import { paymentDateWhere } from '@/lib/accounting';
import { formatDateJa, formatDateTimeJst, yen } from '@/lib/format';
import { isCancelled } from '@/lib/indicator';
import { isActive, soldRoomsOn, staysOn } from '@/lib/occupancy';
import { canCheckIn, canCheckOut, effectiveStatus, isAdvanceTransfer, summarizeMoney } from '@/lib/settlement';
import { statusTone } from '@/lib/status';
import { NightAudit } from './NightAudit';

export const dynamic = 'force-dynamic';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = await getBusinessDate();
  const date = sp.date && isIsoDate(sp.date) ? sp.date : today;
  const facility = await getCurrentFacility();

  const [rooms, reservations, payments, lastImport, inHouseAll, registerClosed] = await Promise.all([
    prisma.room.findMany({ where: { facilityId: facility.id } }),
    prisma.reservation.findMany({
      where: { facilityId: facility.id, arrival: { lte: date }, departure: { gte: date } },
      include: {
        payments: { select: { kind: true, source: true, amount: true, method: true } },
        assignments: { include: { room: { select: { number: true } } } },
      },
      orderBy: [{ arrival: 'asc' }, { bookedAt: 'asc' }],
    }),
    prisma.payment.findMany({ where: { reservation: { facilityId: facility.id }, ...paymentDateWhere(date, addDays(date, 1)) } }),
    prisma.importLog.findFirst({ where: { facilityId: facility.id }, orderBy: { createdAt: 'desc' } }),
    // 預り金を持ったまま滞在中の予約（全期間）
    prisma.reservation.findMany({
      where: { facilityId: facility.id, localCheckedInAt: { not: null }, localCheckedOutAt: null },
      include: { payments: { select: { kind: true, source: true, amount: true, method: true } } },
    }),
    prisma.registerClose.findUnique({ where: { facilityId_date: { facilityId: facility.id, date: today } } }),
  ]);

  const sellable = rooms.filter((r) => !r.outOfOrder).length;
  const active = reservations.filter(isActive);
  const tonight = active.filter((r) => staysOn(r, date));
  const sold = soldRoomsOn(active, date);
  const arrivals = active.filter((r) => r.arrival === date);
  const departures = active.filter((r) => r.departure === date);
  const arrivedCount = arrivals.filter((r) => r.localCheckedInAt).length;
  const departedCount = departures.filter((r) => r.localCheckedOutAt).length;
  // 前受金からの振替はお金が動いていないので含めない
  const moved = payments.filter((p) => !isAdvanceTransfer(p));
  const sumKind = (...kinds: string[]) => moved.filter((p) => kinds.includes(p.kind)).reduce((s, p) => s + p.amount, 0);
  const paidToday = sumKind('payment');
  const depositToday = sumKind('deposit');
  const advanceToday = sumKind('advance');
  const refundToday = sumKind('refund', 'advance_refund');

  // 部屋タイプ別の残室（今夜）
  const typeMap = new Map<string, { code: string; name: string; total: number; ooo: number }>();
  for (const room of rooms) {
    const code = room.typeCode ?? room.type;
    const t = typeMap.get(code) ?? { code, name: room.type, total: 0, ooo: 0 };
    t.total++;
    if (room.outOfOrder) t.ooo++;
    typeMap.set(code, t);
  }
  const types = [...typeMap.values()]
    .map((t) => {
      const soldT = soldRoomsOn(active, date, t.code);
      return { ...t, sold: soldT, remaining: t.total - t.ooo - soldT };
    })
    .sort((a, b) => b.total - a.total);

  // 要対応
  const unassigned = tonight.filter((r) => !r.localCheckedOutAt && r.assignments.length < r.roomCount);
  const unpaidInHouse = inHouseAll.filter((r) => summarizeMoney(r, r.payments).remaining > 0);
  const notCheckedOut = date === today ? departures.filter((r) => r.localCheckedInAt && !r.localCheckedOutAt) : [];
  const noShows = date === today ? arrivals.filter((r) => !r.localCheckedInAt) : [];
  const cancelledInHouse = reservations.filter((r) => isCancelled(r.status) && r.localCheckedInAt && !r.localCheckedOutAt);
  const oooRooms = rooms.filter((r) => r.outOfOrder);
  const importAgeHours = lastImport ? (Date.now() - lastImport.createdAt.getTime()) / 3_600_000 : null;
  const todos: { tone: 'warn' | 'info' | 'error'; text: string; href?: string; link?: string }[] = [];
  if (!lastImport) todos.push({ tone: 'warn', text: 'らく通の予約がまだ取り込まれていません。', href: '/import', link: '取り込む' });
  else if (importAgeHours! > 3) todos.push({ tone: 'warn', text: `最後の取り込みから ${Math.floor(importAgeHours!)} 時間たっています（${formatDateTimeJst(lastImport.createdAt)}）。`, href: '/import', link: '取り込む' });
  if (unassigned.length) todos.push({ tone: 'warn', text: `部屋割りが済んでいない予約が ${unassigned.length} 件あります。`, href: `/indicator?date=${date}`, link: 'インジケーターで部屋割り' });
  if (unpaidInHouse.length) todos.push({ tone: 'error', text: `滞在中で未収が残っている予約が ${unpaidInHouse.length} 件あります。`, href: `/reservations?date=${date}`, link: '予約を見る' });
  if (notCheckedOut.length) todos.push({ tone: 'info', text: `本日出発でまだチェックアウトしていない予約が ${notCheckedOut.length} 件あります。` });
  if (cancelledInHouse.length) todos.push({ tone: 'error', text: `チェックイン済みなのに、らく通で取消になった予約が ${cancelledInHouse.length} 件あります。フロントで確認してください。` });
  if (oooRooms.length) todos.push({ tone: 'info', text: `故障・使用停止中の部屋：${oooRooms.map((r) => r.number).join('、')}`, href: '/settings/rooms', link: '客室マスタ' });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ダッシュボード</h1>
          <div className="sub">{facility.name} ・ {formatDateJa(date, true)}{date !== today && <> ・ <Link href="/dashboard">営業日に戻る</Link></>}</div>
        </div>
        <div className="row">
          <Link className="btn" href={`/indicator?date=${date}`}>インジケーター</Link>
          <Link className="btn primary" href="/import">らく通 CSV を取り込む</Link>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <div className="sub">今夜の稼働率</div>
          <div className="kpi-num">{sellable ? pct(sold / sellable) : '—'}</div>
          <div className="sub">販売 {sold} / {sellable} 室{rooms.length !== sellable ? `（故障 ${rooms.length - sellable} 室を除く）` : ''}</div>
        </div>
        <div className="card kpi">
          <div className="sub">本日の到着</div>
          <div className="kpi-num">{arrivals.length}<small> 件</small></div>
          <div className="sub">チェックイン済 {arrivedCount} ・ 未 {arrivals.length - arrivedCount}</div>
        </div>
        <div className="card kpi">
          <div className="sub">本日の出発</div>
          <div className="kpi-num">{departures.length}<small> 件</small></div>
          <div className="sub">チェックアウト済 {departedCount} ・ 未 {departures.length - departedCount}</div>
        </div>
        <div className="card kpi">
          <div className="sub">本日の入金（宿泊料等）</div>
          <div className="kpi-num">{yen(paidToday)}</div>
          <div className="sub">預り金 受入 {yen(depositToday)}{advanceToday > 0 ? ` ・ 前受金 ${yen(advanceToday)}` : ''} ・ 返金 {yen(refundToday)}</div>
        </div>
      </div>

      {date === today && (
        <NightAudit
          businessDate={today}
          nextDate={addDays(today, 1)}
          registerClosed={!!registerClosed}
          checks={[
            { label: 'noshow', count: noShows.length, href: `/reservations?date=${today}`, okText: '本日到着の予約は、すべてチェックインしています。', ngText: '本日到着でまだチェックインしていない予約が {n} 件あります（ノーショーの可能性）。' },
            { label: 'checkout', count: notCheckedOut.length, okText: '本日出発の予約は、すべてチェックアウトしています。', ngText: '本日出発でまだチェックアウトしていない予約が {n} 件あります。' },
            { label: 'unpaid', count: unpaidInHouse.length, okText: '滞在中の予約に未収はありません。', ngText: '滞在中で未収が残っている予約が {n} 件あります。' },
            { label: 'assign', count: unassigned.length, href: `/indicator?date=${today}`, okText: '今夜泊まる予約は、すべて部屋割りが済んでいます。', ngText: '今夜泊まる予約のうち、部屋割りが済んでいないものが {n} 件あります。' },
          ]}
        />
      )}

      {todos.length > 0 && (
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h2>要対応</h2>
          {todos.map((t, i) => (
            <div key={i} className={`notice ${t.tone === 'error' ? 'error' : t.tone === 'warn' ? 'warn' : 'ok'}`} style={t.tone === 'info' ? { background: 'var(--accent-soft)', color: 'var(--info-fg)', borderColor: '#bfd7ea' } : undefined}>
              {t.text}{t.href && <> <Link href={t.href}>{t.link}</Link></>}
            </div>
          ))}
        </div>
      )}

      <div className="dash-grid">
        <div className="card">
          <div className="card-head"><h2>本日の到着予定（{arrivals.length} 件）</h2><Link href={`/reservations?date=${date}`} className="sub">予約一覧で見る</Link></div>
          {arrivals.length === 0 ? <div className="card-pad sub">到着予定はありません。</div> : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>お客様</th><th>室タイプ</th><th>部屋</th><th>泊</th><th>エージェント</th><th className="num">現地払い</th><th>状態</th><th></th></tr></thead>
                <tbody>
                  {arrivals.map((r) => {
                    const money = summarizeMoney(r, r.payments);
                    const roomsNo = r.assignments.map((a) => a.room.number).join('・');
                    const status = effectiveStatus(r);
                    return (
                      <tr key={r.id}>
                        <td><Link href={`/reservations/${r.id}`}>{r.guestName}</Link>{r.memo && <span className="tag warn" style={{ marginLeft: 6 }}>メモ</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.roomTypeCode ?? r.roomType}{r.roomCount > 1 ? ` ×${r.roomCount}` : ''}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{roomsNo || <span className="tag warn">未割当</span>}</td>
                        <td>{r.nights ?? '—'}</td>
                        <td>{r.channel ?? '—'}</td>
                        <td className="num">{money.prepaidOnline ? <span className="sub">事前</span> : yen(money.billed)}</td>
                        <td><span className={`tag ${statusTone(status)}`}>{status}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.assignments.length < r.roomCount && <Link className="btn small" href={`/indicator?date=${date}`}>部屋割り</Link>}
                          {canCheckIn(r, today, r.assignments.length).ok && <Link className="btn small primary" href={`/reservations/${r.id}?checkin=1`}>チェックイン精算</Link>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <h2>今夜の残室（部屋タイプ別）</h2>
            {types.map((t) => (
              <div key={t.code} className="meter">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{t.name} <span className="sub">（{t.code}・{t.total} 室）</span></span>
                  <b style={{ color: t.remaining <= 0 ? 'var(--danger)' : t.remaining <= 2 ? 'var(--warn-fg)' : undefined }}>{t.remaining <= 0 ? '満室' : `残 ${t.remaining}`}</b>
                </div>
                <div className="meter-bar" aria-hidden="true"><div style={{ width: `${Math.min(100, ((t.sold + t.ooo) / Math.max(1, t.total)) * 100)}%` }} /></div>
              </div>
            ))}
            <Link href={`/inventory?start=${date}`} className="sub">在庫の推移を見る</Link>
          </div>
          <div className="card card-pad stack" style={{ gap: 6 }}>
            <h2>らく通の取り込み</h2>
            {lastImport ? (
              <div className="sub">最終：{formatDateTimeJst(lastImport.createdAt)} ・ {lastImport.fileName}（新規 {lastImport.created} ・ 更新 {lastImport.updated}）</div>
            ) : <div className="sub">まだ取り込みはありません。</div>}
            <Link href="/import" className="sub">取り込み画面へ</Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>本日の出発予定（{departures.length} 件）</h2></div>
        {departures.length === 0 ? <div className="card-pad sub">出発予定はありません。</div> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>お客様</th><th>部屋</th><th>泊</th><th className="num">未収</th><th className="num">預り金</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {departures.map((r) => {
                  const money = summarizeMoney(r, r.payments);
                  const status = effectiveStatus(r);
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/reservations/${r.id}`}>{r.guestName}</Link></td>
                      <td>{r.assignments.map((a) => a.room.number).join('・') || '—'}</td>
                      <td>{r.nights ?? '—'}</td>
                      <td className="num" style={{ color: money.remaining > 0 ? 'var(--warn-fg)' : undefined }}>{yen(money.remaining)}</td>
                      <td className="num">{money.depositBalance ? yen(money.depositBalance) : '—'}</td>
                      <td><span className={`tag ${statusTone(status)}`}>{status}</span></td>
                      <td>{canCheckOut(r).ok && <Link className="btn small" href={`/reservations/${r.id}?checkout=1`}>チェックアウト</Link>}</td>
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
