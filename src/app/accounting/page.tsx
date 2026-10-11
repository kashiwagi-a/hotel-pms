import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { addDays, isIsoDate } from '@/lib/dates';
import { formatDateJa, formatDateTimeJst, yen } from '@/lib/format';
import { formatMethod, isAdvanceTransfer, summarizeMoney } from '@/lib/settlement';
import { DENOMINATIONS, expectedCash, parseDenominations, paymentDateWhere, summarizeByMethod } from '@/lib/accounting';
import { DatePicker } from '@/components/DatePicker';
import { RegisterCloseForm } from './RegisterCloseForm';
import { reopenRegisterAction } from './actions';

export const dynamic = 'force-dynamic';

const KIND = { payment: '入金', deposit: '預り金', refund: '返金', advance: '前受金', advance_refund: '前受金返金' } as const;
const DEFAULT_FLOAT = 50000;

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = await getBusinessDate();
  const date = sp.date && isIsoDate(sp.date) ? sp.date : today;
  const facility = await getCurrentFacility();

  const [rows, closed, lastClose, holding] = await Promise.all([
    prisma.payment.findMany({
      where: { reservation: { facilityId: facility.id }, ...paymentDateWhere(date, addDays(date, 1)) },
      include: { reservation: { select: { id: true, guestName: true, assignments: { select: { room: { select: { number: true } } } } } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.registerClose.findUnique({ where: { facilityId_date: { facilityId: facility.id, date } } }),
    prisma.registerClose.findFirst({ where: { facilityId: facility.id }, orderBy: { date: 'desc' } }),
    // 預り金・前受金を持っている、まだチェックアウトしていない予約（全期間の残高）
    prisma.reservation.findMany({
      where: { facilityId: facility.id, localCheckedOutAt: null, payments: { some: { kind: { in: ['deposit', 'advance'] } } } },
      include: { payments: { select: { kind: true, source: true, amount: true, method: true } } },
    }),
  ]);

  // 前受金からの振替はお金が動いていないので、受入の合計には含めない
  const moved = rows.filter((p) => !isAdvanceTransfer(p));
  const transfers = rows.filter((p) => isAdvanceTransfer(p));
  const sum = (...kinds: string[]) => moved.filter((p) => kinds.includes(p.kind)).reduce((s, p) => s + p.amount, 0);
  const paid = sum('payment');
  const deposit = sum('deposit');
  const advance = sum('advance');
  const refund = sum('refund', 'advance_refund');
  const transferTotal = transfers.reduce((s, p) => s + p.amount, 0);
  const byMethod = summarizeByMethod(rows);
  const cashMovement = expectedCash(rows, 0);
  const balances = holding.map((r) => summarizeMoney(r, r.payments));
  const depositBalance = balances.reduce((s, m) => s + m.depositBalance, 0);
  const advanceBalance = balances.reduce((s, m) => s + Math.max(0, m.advanceBalance), 0);
  const closedDenoms = parseDenominations(closed?.denominations);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>フロント会計（集計）</h1>
          <div className="sub">{facility.name} ・ チェックイン精算・未収の精算・預り金・返金をまとめて集計します。会計の入力は予約とインジケーターの画面で行います。</div>
        </div>
        <form className="row" action="/accounting">
          <Link className="btn small" href={`/accounting?date=${addDays(date, -1)}`}>前日</Link>
          <DatePicker name="date" value={date} today={today} autoSubmit ariaLabel="営業日" />
          <Link className="btn small" href={`/accounting?date=${addDays(date, 1)}`}>翌日</Link>
          {date !== today && <Link className="btn small" href="/accounting">営業日</Link>}
        </form>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="sub">入金（宿泊料等）</div><div className="kpi-num">{yen(paid)}</div><div className="sub">{moved.filter((p) => p.kind === 'payment').length} 件{transferTotal > 0 ? ` ・ ほかに前受金から振替 ${yen(transferTotal)}` : ''}</div></div>
        <div className="card kpi"><div className="sub">預り金・前受金の受入</div><div className="kpi-num">{yen(deposit + advance)}</div><div className="sub">預り金 {yen(deposit)} ・ 前受金 {yen(advance)} ・ 返金 {yen(refund)}</div></div>
        <div className="card kpi"><div className="sub">現金の動き</div><div className="kpi-num">{yen(cashMovement)}</div><div className="sub">入金＋預り金＋前受金−返金（現金のみ）</div></div>
        <div className="card kpi"><div className="sub">残高（チェックアウト前の全予約）</div><div className="kpi-num" style={{ color: 'var(--info-fg)' }}>{yen(depositBalance)}</div><div className="sub">預り金 {balances.filter((m) => m.depositBalance > 0).length} 件 ・ 前受金 <span style={{ color: 'var(--advance-fg)' }}>{yen(advanceBalance)}</span>（{balances.filter((m) => m.advanceBalance > 0).length} 件）</div></div>
      </div>

      <div className="dash-grid">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>支払方法・ブランド別</h2><span className="sub">{formatDateJa(date, true)}</span></div>
            {byMethod.length === 0 ? <div className="card-pad sub">この日の入金はありません。</div> : (
              <div className="table-wrap">
                <table className="grid">
                  <thead><tr><th>支払方法</th><th className="num">件数</th><th className="num">入金</th><th className="num">預り金</th><th className="num">前受金</th><th className="num">返金</th><th className="num">差引</th></tr></thead>
                  <tbody>
                    {byMethod.map((m) => (
                      <tr key={m.label}>
                        <td><b>{m.label}</b></td>
                        <td className="num">{m.count}</td>
                        <td className="num">{yen(m.payment)}</td>
                        <td className="num">{yen(m.deposit)}</td>
                        <td className="num">{yen(m.advance)}</td>
                        <td className="num">{m.refund ? `−${yen(m.refund)}` : yen(0)}</td>
                        <td className="num"><b>{yen(m.payment + m.deposit + m.advance - m.refund)}</b></td>
                      </tr>
                    ))}
                    <tr>
                      <td><b>合計</b></td>
                      <td className="num">{moved.length}</td>
                      <td className="num"><b>{yen(paid)}</b></td>
                      <td className="num"><b>{yen(deposit)}</b></td>
                      <td className="num"><b>{yen(advance)}</b></td>
                      <td className="num"><b>{refund ? `−${yen(refund)}` : yen(0)}</b></td>
                      <td className="num"><b>{yen(paid + deposit + advance - refund)}</b></td>
                    </tr>
                    {transferTotal > 0 && (
                      <tr><td colSpan={7} className="sub">前受金からの振替 {transfers.length} 件 {yen(transferTotal)} は、受け取った日に計上済みのため含めていません。</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h2>取引一覧（{rows.length} 件）</h2></div>
            {rows.length === 0 ? <div className="card-pad sub">この日の取引はありません。</div> : (
              <div className="table-wrap">
                <table className="grid">
                  <thead><tr><th>時刻</th><th>区分</th><th>部屋</th><th>お客様</th><th>方法</th><th className="num">金額</th><th>摘要</th></tr></thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTimeJst(p.createdAt).slice(11)}</td>
                        <td><span className={`tag${p.kind === 'deposit' ? ' deposit' : p.kind.startsWith('advance') && p.kind !== 'advance_refund' ? ' advance' : p.kind.endsWith('refund') ? ' warn' : ' info'}`}>{KIND[p.kind as keyof typeof KIND] ?? p.kind}</span></td>
                        <td>{p.reservation.assignments.map((a) => a.room.number).join('・') || '—'}</td>
                        <td><Link href={`/reservations/${p.reservation.id}`}>{p.reservation.guestName}</Link></td>
                        <td>{formatMethod(p.method, p.brand)}</td>
                        <td className="num" style={{ color: p.kind.endsWith('refund') ? 'var(--danger)' : isAdvanceTransfer(p) ? 'var(--muted)' : undefined }}>{p.kind.endsWith('refund') ? '−' : ''}{yen(p.amount)}</td>
                        <td className="sub">{p.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>レジ締め</h2>
            <span className={`tag ${closed ? '' : 'ok'}`}>{closed ? `締め済 ${formatDateTimeJst(closed.closedAt).slice(11)}` : '営業中'}</span>
          </div>
          {closed ? (
            <>
              <div className="money">
                <div><span>釣銭準備金</span><span>{yen(closed.floatAmount)}</span></div>
                <div><span>理論在高</span><span>{yen(closed.expectedCash)}</span></div>
                <div><span>実査</span><span>{yen(closed.countedCash)}</span></div>
                <div className="total" style={{ color: closed.diff === 0 ? 'var(--ok-fg)' : 'var(--danger)' }}><span>過不足</span><span>{closed.diff === 0 ? 'なし' : `${closed.diff > 0 ? '+' : ''}${yen(closed.diff)}`}</span></div>
              </div>
              {closedDenoms && (
                <table className="denoms" aria-label="数えた金種">
                  <thead><tr><th>金種</th><th className="num">枚数</th><th className="num">金額</th></tr></thead>
                  <tbody>
                    {DENOMINATIONS.filter((d) => closedDenoms[d]).map((d) => (
                      <tr key={d}><td className="face">{yen(d)}</td><td className="num">{closedDenoms[d]} 枚</td><td className="num">{yen(d * closedDenoms[d]!)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {closed.note && <div className="sub">メモ：{closed.note}</div>}
              {expectedCash(rows, closed.floatAmount) !== closed.expectedCash && (
                <div className="notice warn">締めた後に現金の取引がありました。締めを取り消してやり直してください。</div>
              )}
              <form action={reopenRegisterAction}><input type="hidden" name="date" value={date} /><button className="btn small danger" type="submit">締めを取り消す</button></form>
            </>
          ) : (
            <RegisterCloseForm date={date} cashMovement={cashMovement} defaultFloat={lastClose?.floatAmount ?? DEFAULT_FLOAT} />
          )}
        </div>
      </div>
    </>
  );
}
