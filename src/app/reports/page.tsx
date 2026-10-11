import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { addDays, diffDays, eachDay, isIsoDate, monthRange } from '@/lib/dates';
import { paymentDateWhere, summarizeByMethod } from '@/lib/accounting';
import { formatDateJa, yen } from '@/lib/format';
import { isActive, nightsWithin, periodStats, revenuePerNight, soldRoomsOn, staysOn } from '@/lib/occupancy';
import { isCancelled } from '@/lib/indicator';
import { requiresOnSitePayment } from '@/lib/rakutsu-csv';
import { DatePicker } from '@/components/DatePicker';

export const dynamic = 'force-dynamic';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function resolvePeriod(sp: { p?: string; from?: string; to?: string }, today: string) {
  const thisMonth = today.slice(0, 7);
  if (sp.p === 'last-month') {
    const prev = monthRange(thisMonth).from;
    const d = new Date(`${prev}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return { ...monthRange(d.toISOString().slice(0, 7)), key: 'last-month' };
  }
  if (sp.p === '7d') return { from: addDays(today, -6), to: addDays(today, 1), key: '7d' };
  if (sp.p === '30d') return { from: addDays(today, -29), to: addDays(today, 1), key: '30d' };
  if (sp.p === 'next30') return { from: today, to: addDays(today, 30), key: 'next30' };
  if (sp.from && sp.to && isIsoDate(sp.from) && isIsoDate(sp.to) && sp.from <= sp.to && diffDays(sp.from, sp.to) <= 366) {
    return { from: sp.from, to: addDays(sp.to, 1), key: 'custom' };
  }
  return { ...monthRange(thisMonth), key: 'this-month' };
}

const PRESETS = [
  { key: 'this-month', label: '今月' },
  { key: 'last-month', label: '先月' },
  { key: '7d', label: '直近 7 日' },
  { key: '30d', label: '直近 30 日' },
  { key: 'next30', label: 'これから 30 日' },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = await getBusinessDate();
  const { from, to, key } = resolvePeriod(sp, today);
  const lastDay = addDays(to, -1);
  const days = eachDay(from, to);
  const facility = await getCurrentFacility();

  const [rooms, reservations, payments] = await Promise.all([
    prisma.room.findMany({ where: { facilityId: facility.id } }),
    prisma.reservation.findMany({ where: { facilityId: facility.id, arrival: { lt: to }, departure: { gt: from } } }),
    prisma.payment.findMany({
      where: { reservation: { facilityId: facility.id }, ...paymentDateWhere(from, to) },
    }),
  ]);
  const sellable = rooms.filter((r) => !r.outOfOrder).length;
  const active = reservations.filter(isActive);
  const stats = periodStats(active, sellable, from, to);
  const cancelled = reservations.filter((r) => isCancelled(r.status)).length;
  const cancelRate = reservations.length ? cancelled / reservations.length : 0;

  // 日別
  const daily = days.map((d) => {
    const sold = soldRoomsOn(active, d);
    const revenue = Math.round(active.filter((r) => staysOn(r, d)).reduce((s, r) => s + revenuePerNight(r), 0));
    return { date: d, sold, occ: sellable ? sold / sellable : 0, revenue };
  });

  // エージェント別・部屋タイプ別・決済方法別
  type Group = { key: string; label: string; bookings: number; roomNights: number; revenue: number };
  const group = (keyOf: (r: (typeof active)[number]) => string, labelOf: (k: string) => string) => {
    const map = new Map<string, Group>();
    for (const r of active) {
      const n = nightsWithin(r, from, to);
      if (n === 0) continue;
      const k = keyOf(r);
      const g = map.get(k) ?? { key: k, label: labelOf(k), bookings: 0, roomNights: 0, revenue: 0 };
      g.bookings++;
      g.roomNights += n * r.roomCount;
      g.revenue += n * revenuePerNight(r);
      map.set(k, g);
    }
    return [...map.values()].map((g) => ({ ...g, revenue: Math.round(g.revenue) })).sort((a, b) => b.revenue - a.revenue);
  };
  const byChannel = group((r) => r.channel ?? '（不明）', (k) => k);
  const typeNames = new Map(rooms.map((r) => [r.typeCode ?? r.type, r.type]));
  const typeRooms = new Map<string, number>();
  for (const r of rooms) if (!r.outOfOrder) typeRooms.set(r.typeCode ?? r.type, (typeRooms.get(r.typeCode ?? r.type) ?? 0) + 1);
  const byType = group((r) => r.roomTypeCode ?? r.roomType ?? '（不明）', (k) => typeNames.get(k) ?? k);
  const bySettlement = group((r) => (requiresOnSitePayment(r.settlement) ? 'onsite' : 'prepaid'), (k) => (k === 'onsite' ? '現地決済・現地精算' : '事前決済・法人決済など'));
  const maxChannel = Math.max(1, ...byChannel.map((g) => g.revenue));

  // 前受金からの振替はお金が動いていないので含めない
  const payByMethod = summarizeByMethod(payments);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>レポート</h1>
          <div className="sub">{facility.name} ・ {formatDateJa(from, true)} 〜 {formatDateJa(lastDay, true)}（{days.length} 日）・ 販売可能 {sellable} 室</div>
        </div>
      </div>

      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row" role="group" aria-label="期間">
          {PRESETS.map((p) => <Link key={p.key} href={`/reports?p=${p.key}`} className={`btn small${key === p.key ? ' primary' : ''}`} aria-current={key === p.key ? 'page' : undefined}>{p.label}</Link>)}
        </div>
        <form className="row" action="/reports">
          <span className="sub">期間を指定</span>
          <DatePicker name="from" value={from} today={today} ariaLabel="開始日" />
          <span className="sub">〜</span>
          <DatePicker name="to" value={lastDay} today={today} ariaLabel="終了日" />
          <button className="btn small" type="submit">表示</button>
        </form>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="sub">稼働率</div><div className="kpi-num">{pct(stats.occupancy)}</div><div className="sub">販売 {stats.roomNights.toLocaleString('ja-JP')} / {stats.capacity.toLocaleString('ja-JP')} 室泊</div></div>
        <div className="card kpi"><div className="sub">宿泊売上</div><div className="kpi-num">{yen(stats.revenue)}</div><div className="sub">ポイント割引後額を泊ごとに振り分け</div></div>
        <div className="card kpi"><div className="sub">ADR（平均客室単価）</div><div className="kpi-num">{yen(stats.adr)}</div><div className="sub">宿泊売上 ÷ 販売室泊数</div></div>
        <div className="card kpi"><div className="sub">RevPAR</div><div className="kpi-num">{yen(stats.revpar)}</div><div className="sub">宿泊売上 ÷ 販売可能室泊数</div></div>
        <div className="card kpi"><div className="sub">取消</div><div className="kpi-num">{cancelled}<small> 件</small></div><div className="sub">期間に泊まる予約の {pct(cancelRate)}</div></div>
      </div>

      <div className="card card-pad stack">
        <h2>日別の稼働率</h2>
        {days.length > 62 ? <div className="sub">日数が多いため、グラフは 62 日までの期間で表示します。</div> : (
          <div className="bars" role="img" aria-label={`日別の稼働率。最高 ${pct(Math.max(...daily.map((d) => d.occ), 0))}、最低 ${pct(Math.min(...daily.map((d) => d.occ), 0))}。下の表に数値があります。`}>
            <div className="bars-grid" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
            <div className="bars-plot">
              {daily.map((d) => {
                const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
                return (
                  <div key={d.date} className="bar-col" tabIndex={0}>
                    <div className="bar" style={{ height: `${Math.min(100, d.occ * 100)}%` }} />
                    <span className={`bar-x${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}`}>{days.length <= 16 || Number(d.date.slice(8)) % 5 === 1 || d.date === from ? Number(d.date.slice(8)) : ''}</span>
                    <div className="bar-tip" role="tooltip">{formatDateJa(d.date)}<br />稼働率 {pct(d.occ)}（{d.sold} 室）<br />売上 {yen(d.revenue)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <details>
          <summary className="sub" style={{ cursor: 'pointer' }}>日別の数値を表で見る</summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="grid">
              <thead><tr><th>日付</th><th className="num">販売室数</th><th className="num">稼働率</th><th className="num">宿泊売上</th></tr></thead>
              <tbody>{daily.map((d) => <tr key={d.date}><td>{formatDateJa(d.date)}</td><td className="num">{d.sold}</td><td className="num">{pct(d.occ)}</td><td className="num">{yen(d.revenue)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>エージェント別</h2></div>
          {byChannel.length === 0 ? <div className="card-pad sub">期間内の予約はありません。</div> : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>エージェント</th><th className="num">予約</th><th className="num">室泊</th><th className="num">売上</th><th style={{ width: '30%' }}>構成比</th></tr></thead>
                <tbody>
                  {byChannel.map((g) => (
                    <tr key={g.key}>
                      <td>{g.label}</td>
                      <td className="num">{g.bookings}</td>
                      <td className="num">{g.roomNights}</td>
                      <td className="num">{yen(g.revenue)}</td>
                      <td title={`${g.label}：${yen(g.revenue)}（${pct(stats.revenue ? g.revenue / stats.revenue : 0)}）`}>
                        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <div className="meter-bar" style={{ flex: 1 }}><div style={{ width: `${(g.revenue / maxChannel) * 100}%` }} /></div>
                          <span className="sub" style={{ minWidth: 44, textAlign: 'right' }}>{pct(stats.revenue ? g.revenue / stats.revenue : 0)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h2>部屋タイプ別</h2></div>
          {byType.length === 0 ? <div className="card-pad sub">期間内の予約はありません。</div> : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>部屋タイプ</th><th className="num">室泊</th><th className="num">稼働率</th><th className="num">売上</th><th className="num">ADR</th></tr></thead>
                <tbody>
                  {byType.map((g) => {
                    const cap = (typeRooms.get(g.key) ?? 0) * days.length;
                    return (
                      <tr key={g.key}>
                        <td>{g.label} <span className="sub">{g.key}</span></td>
                        <td className="num">{g.roomNights}</td>
                        <td className="num">{cap ? pct(g.roomNights / cap) : '—'}</td>
                        <td className="num">{yen(g.revenue)}</td>
                        <td className="num">{g.roomNights ? yen(Math.round(g.revenue / g.roomNights)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>決済方法別（予約）</h2></div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>区分</th><th className="num">予約</th><th className="num">室泊</th><th className="num">売上</th></tr></thead>
              <tbody>{bySettlement.map((g) => <tr key={g.key}><td>{g.label}</td><td className="num">{g.bookings}</td><td className="num">{g.roomNights}</td><td className="num">{yen(g.revenue)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>フロントでの入金（支払方法・ブランド別）</h2><Link className="sub" href="/accounting">フロント会計へ</Link></div>
          {payByMethod.length === 0 ? <div className="card-pad sub">期間内の入金はありません。</div> : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>支払方法</th><th className="num">入金</th><th className="num">預り金</th><th className="num">前受金</th><th className="num">返金</th></tr></thead>
                <tbody>{payByMethod.map((m) => <tr key={m.label}><td>{m.label}</td><td className="num">{yen(m.payment)}</td><td className="num">{yen(m.deposit)}</td><td className="num">{yen(m.advance)}</td><td className="num">{m.refund ? `−${yen(m.refund)}` : yen(0)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="sub">売上は、らく通のポイント割引後額を泊数で割り、期間内の泊数分を数えています。取消の予約は含めません。販売可能室数は、現在の客室マスタから故障の部屋を除いた数です。</div>
    </>
  );
}
