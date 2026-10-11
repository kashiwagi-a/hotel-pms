import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { formatDateJa, formatDateTimeJst, yen } from '@/lib/format';
import { statusTone } from '@/lib/status';
import { isCancelled } from '@/lib/indicator';
import { canCheckIn, canCheckOut, effectiveStatus, formatMethod, summarizeMoney } from '@/lib/settlement';
import { SettleButtons } from './SettleButtons';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { payment: '入金', deposit: '預り金', refund: '返金', advance: '前受金', advance_refund: '前受金返金' };

export default async function ReservationDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkin?: string; deposit?: string; checkout?: string; advance?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const facility = await getCurrentFacility();
  const r = await prisma.reservation.findFirst({
    where: { id: Number(id), facilityId: facility.id },
    include: { payments: { orderBy: { createdAt: 'asc' } }, assignments: { include: { room: true } } },
  });
  if (!r) notFound();

  const status = effectiveStatus(r);
  const money = summarizeMoney(r, r.payments);
  const check = canCheckIn(r, await getBusinessDate(), r.assignments.length);
  const canDeposit = status === '滞在中';
  const canCheckout = canCheckOut(r).ok;
  const rooms = r.assignments.map((a) => a.room).sort((a, b) => a.number.localeCompare(b.number, 'ja', { numeric: true }));
  const roomLabel = rooms.length ? rooms.map((x) => x.number).join('・') : '未割当';

  return (
    <>
      <nav className="sub" aria-label="現在位置"><Link href="/reservations">予約</Link> ／ 予約詳細</nav>
      <div className="page-head">
        <div className="row" style={{ gap: 12 }}>
          <h1>{r.guestName} 様</h1>
          <span className={`tag ${statusTone(status)}`}>{status}</span>
          {r.localCheckedInAt && <span className="sub">チェックイン：{formatDateTimeJst(r.localCheckedInAt)}</span>}
          {r.localCheckedOutAt && <span className="sub">チェックアウト：{formatDateTimeJst(r.localCheckedOutAt)}</span>}
          {r.isSample && <span className="tag warn">サンプル</span>}
        </div>
        <div className="row">
          <SettleButtons
            target={{
              id: r.id, guest: r.guestName, room: `${roomLabel} ${r.roomType ?? ''}`.trim(),
              stay: `${formatDateJa(r.arrival)} 〜 ${formatDateJa(r.departure)} ・ ${r.nights ?? '—'} 泊 ・ ${r.pax ?? '—'} 名 ・ ${r.roomCount} 室`,
              settlement: r.settlement, billed: money.billed,
              paidHere: money.paidHere, remaining: money.remaining, depositBalance: money.depositBalance,
              advanceBalance: money.advanceBalance,
            }}
            canCheckin={check.ok}
            checkinReason={!check.ok && !r.localCheckedInAt && !isCancelled(r.status) ? check.reason : undefined}
            canDeposit={canDeposit}
            canCheckout={canCheckout}
            canPay={status === '滞在中' && money.remaining > 0}
            canAdvance={!isCancelled(r.status) && !r.localCheckedInAt && !r.localCheckedOutAt}
            initial={sp.checkin ? 'checkin' : sp.deposit ? 'deposit' : sp.checkout ? 'checkout' : sp.advance ? 'advance' : null}
          />
          {r.arrival && <Link className="btn" href={`/indicator?date=${r.arrival}`}>インジケーターで部屋割り</Link>}
        </div>
      </div>

      {isCancelled(r.status) && <div className="notice warn">らく通で取消になった予約です。</div>}

      <div className="grid-2">
        <div className="card card-pad stack">
          <h2>予約内容</h2>
          <dl className="kv">
            <dt>予約番号</dt><dd>{r.bookingNo ?? '—'}</dd>
            <dt>区分（らく通）</dt><dd>{r.status}</dd>
            <dt>チェックイン</dt><dd>{formatDateJa(r.arrival, true)}</dd>
            <dt>チェックアウト</dt><dd>{formatDateJa(r.departure, true)}</dd>
            <dt>泊数・人数</dt><dd>{r.nights ?? '—'} 泊 ・ {r.pax ?? '—'} 名</dd>
            <dt>室タイプ・室数</dt><dd>{r.roomType ?? '—'}{r.roomTypeCode ? `（${r.roomTypeCode}）` : ''} ・ {r.roomCount} 室</dd>
            <dt>部屋</dt><dd>{rooms.length ? `${roomLabel}（${rooms.length} / ${r.roomCount} 室）` : `未割当（0 / ${r.roomCount} 室）`}</dd>
            <dt>プラン</dt><dd>{r.planName ?? '—'}</dd>
            <dt>エージェント</dt><dd>{r.channel ?? '—'}</dd>
            <dt>電話番号</dt><dd>{r.phone ?? '—'}</dd>
            <dt>受信日／登録日</dt><dd>{formatDateTimeJst(r.bookedAt)}</dd>
            <dt>確認・印刷・連動</dt><dd>{[r.confirmMark, r.printMark, r.linkMark].map((v) => v ?? '—').join(' ・ ')}</dd>
          </dl>
          {r.memo && <div className="notice warn">予約メモ：{r.memo}</div>}
        </div>

        <div className="card card-pad stack">
          <h2>料金・精算</h2>
          <dl className="kv">
            <dt>決済方法</dt><dd>{r.settlement ?? '—'}</dd>
            <dt>ポイント額</dt><dd>{yen(r.couponPoints)}</dd>
            <dt>ポイント割引後額</dt><dd>{yen(r.totalAmount)}</dd>
            <dt>現地でのお支払い</dt><dd>{money.prepaidOnline ? 'なし（事前決済・法人決済）' : yen(money.billed)}</dd>
            <dt>この画面で受領</dt><dd>{yen(money.paidHere)}</dd>
            <dt>未収</dt><dd style={{ color: money.remaining > 0 ? 'var(--warn-fg)' : undefined }}>{yen(money.remaining)}</dd>
            <dt>預り金残高</dt><dd style={{ color: 'var(--info-fg)' }}>{yen(money.depositBalance)}</dd>
            <dt>前受金残高</dt><dd style={{ color: 'var(--advance-fg)' }}>{yen(money.advanceBalance)}{money.advanceBalance > 0 && !r.localCheckedInAt ? '（チェックイン時に充当）' : ''}</dd>
          </dl>
          <h2 style={{ marginTop: 4 }}>入金・預り金の内訳</h2>
          {r.payments.length === 0 ? (
            <div className="sub">記録はありません。</div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>区分</th><th>方法</th><th className="num">金額</th><th>日時</th><th>摘要</th></tr></thead>
                <tbody>
                  {r.payments.map((p) => (
                    <tr key={p.id}>
                      <td><span className={`tag${p.kind === 'deposit' ? ' deposit' : p.kind.startsWith('advance') ? ' advance' : ''}`}>{KIND_LABEL[p.kind] ?? p.kind}</span></td>
                      <td>{formatMethod(p.method, p.brand)}</td>
                      <td className="num">{p.kind.endsWith('refund') ? '−' : ''}{yen(p.amount)}</td>
                      <td className="sub">{formatDateTimeJst(p.createdAt)}</td>
                      <td className="sub">{p.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
