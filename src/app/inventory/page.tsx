import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { addDays, eachDay, isIsoDate } from '@/lib/dates';
import { formatDateJa } from '@/lib/format';
import { isActive, soldRoomsOn, staysOn } from '@/lib/occupancy';
import { DatePicker } from '@/components/DatePicker';

export const dynamic = 'force-dynamic';

const DAYS = 14;
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const UNKNOWN = '__unknown__';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ start?: string; type?: string; day?: string }> }) {
  const sp = await searchParams;
  const today = await getBusinessDate();
  const start = sp.start && isIsoDate(sp.start) ? sp.start : today;
  const end = addDays(start, DAYS);
  const days = eachDay(start, end);
  const facility = await getCurrentFacility();

  const [rooms, reservations] = await Promise.all([
    prisma.room.findMany({ where: { facilityId: facility.id } }),
    prisma.reservation.findMany({
      where: { facilityId: facility.id, arrival: { lt: end }, departure: { gt: start } },
      include: { assignments: { include: { room: { select: { number: true } } } } },
      orderBy: [{ arrival: 'asc' }],
    }),
  ]);
  const active = reservations.filter(isActive);

  // 部屋タイプ（記号）ごとの部屋数
  const typeMap = new Map<string, { code: string; name: string; total: number; ooo: number }>();
  for (const room of rooms) {
    const code = room.typeCode ?? room.type;
    const t = typeMap.get(code) ?? { code, name: room.type, total: 0, ooo: 0 };
    t.total++;
    if (room.outOfOrder) t.ooo++;
    typeMap.set(code, t);
  }
  const types = [...typeMap.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
  const known = new Set(types.map((t) => t.code));
  const unknownSold = days.map((d) => active.filter((r) => staysOn(r, d) && !known.has(r.roomTypeCode ?? '')).reduce((s, r) => s + r.roomCount, 0));
  const sellable = rooms.filter((r) => !r.outOfOrder).length;

  const cell = (remaining: number, total: number) => {
    if (total === 0) return 'inv-none';
    if (remaining <= 0) return 'inv-full';
    if (remaining <= 2) return 'inv-low';
    return 'inv-ok';
  };
  const link = (type: string, day: string) => `/inventory?start=${start}&type=${encodeURIComponent(type)}&day=${day}`;

  // 選んだマスの予約
  const selType = sp.type ?? null;
  const selDay = sp.day && isIsoDate(sp.day) ? sp.day : null;
  const selected = selType && selDay
    ? active.filter((r) => staysOn(r, selDay) && (selType === UNKNOWN ? !known.has(r.roomTypeCode ?? '') : r.roomTypeCode === selType))
    : [];
  const selName = selType === UNKNOWN ? 'タイプ不明' : types.find((t) => t.code === selType)?.name ?? selType;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>在庫</h1>
          <div className="sub">{facility.name} ・ 部屋タイプ別の残室（客室マスタの部屋数 − 取り込んだ予約の室数）。予約サイトへの公開在庫は、らく通で管理します。</div>
        </div>
        <form className="row" action="/inventory">
          <Link className="btn small" href={`/inventory?start=${addDays(start, -DAYS)}`}>前の 2 週間</Link>
          <DatePicker name="start" value={start} today={today} autoSubmit ariaLabel="開始日" />
          <Link className="btn small" href={`/inventory?start=${addDays(start, DAYS)}`}>次の 2 週間</Link>
          {start !== today && <Link className="btn small" href="/inventory">営業日から</Link>}
        </form>
      </div>

      <div className="row sub" style={{ gap: 16, fontSize: 12 }}>
        <span className="row" style={{ gap: 6 }}><span className="inv-swatch inv-ok" />余裕あり</span>
        <span className="row" style={{ gap: 6 }}><span className="inv-swatch inv-low" />残 2 以下</span>
        <span className="row" style={{ gap: 6 }}><span className="inv-swatch inv-full" />満室（売りすぎは −）</span>
        <span>マスをクリックすると、その夜の予約が下に表示されます。</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="inv">
            <thead>
              <tr>
                <th className="inv-type">部屋タイプ</th>
                {days.map((d) => {
                  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                  return <th key={d} className={dow === 0 ? 'sun' : dow === 6 ? 'sat' : undefined}>{Number(d.slice(5, 7))}/{Number(d.slice(8))}<br />{DOW[dow]}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.code}>
                  <th className="inv-type">{t.name}<span className="sub">{t.code} ・ {t.total} 室{t.ooo ? `（故障 ${t.ooo}）` : ''}</span></th>
                  {days.map((d) => {
                    const remaining = t.total - t.ooo - soldRoomsOn(active, d, t.code);
                    const on = selType === t.code && selDay === d;
                    return (
                      <td key={d}>
                        <Link className={`inv-cell ${cell(remaining, t.total - t.ooo)}${on ? ' on' : ''}`} href={link(t.code, d)} aria-label={`${t.name} ${formatDateJa(d)} 残り ${remaining} 室`} scroll={false}>
                          {remaining <= 0 && t.total - t.ooo > 0 ? (remaining < 0 ? remaining : '満') : remaining}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {unknownSold.some((n) => n > 0) && (
                <tr>
                  <th className="inv-type">タイプ不明<span className="sub">客室マスタに無い室タイプの予約</span></th>
                  {days.map((d, i) => (
                    <td key={d}>
                      {unknownSold[i] > 0 ? <Link className="inv-cell inv-low" href={link(UNKNOWN, d)} scroll={false}>{unknownSold[i]}</Link> : null}
                    </td>
                  ))}
                </tr>
              )}
              <tr className="inv-total">
                <th className="inv-type">稼働率<span className="sub">販売 / {sellable} 室</span></th>
                {days.map((d) => {
                  const sold = soldRoomsOn(active, d);
                  return <td key={d}><span className="inv-occ">{sellable ? Math.round((sold / sellable) * 100) : 0}%<br /><span className="sub">{sold}</span></span></td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {selType && selDay && (
        <div className="card" id="detail">
          <div className="card-head">
            <h2>{selName} ・ {formatDateJa(selDay, true)} の夜（{selected.reduce((s, r) => s + r.roomCount, 0)} 室・{selected.length} 件）</h2>
            <div className="row">
              <Link className="btn small" href={`/indicator?date=${selDay}`}>インジケーターで見る</Link>
              <Link className="btn small" href={`/inventory?start=${start}`} scroll={false}>閉じる</Link>
            </div>
          </div>
          {selected.length === 0 ? <div className="card-pad sub">予約はありません。</div> : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>お客様</th><th>チェックイン</th><th>チェックアウト</th><th className="num">室数</th><th>部屋</th><th>エージェント</th><th>区分</th></tr></thead>
                <tbody>
                  {selected.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/reservations/${r.id}`}>{r.guestName}</Link></td>
                      <td>{formatDateJa(r.arrival)}</td>
                      <td>{formatDateJa(r.departure)}</td>
                      <td className="num">{r.roomCount}</td>
                      <td>{r.assignments.map((a) => a.room.number).join('・') || <span className="tag warn">未割当</span>}</td>
                      <td>{r.channel ?? '—'}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
