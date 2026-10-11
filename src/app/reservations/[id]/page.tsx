import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { todayJst } from '@/lib/dates';
import { formatDateJa, formatDateTimeJst, yen } from '@/lib/format';
import { statusTone } from '@/lib/status';
import { canCheckIn, effectiveStatus, formatMethod, summarizeMoney } from '@/lib/settlement';
import { SettleButtons } from './SettleButtons';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { payment: '入金', deposit: '預り金', refund: '返金' };

export default async function ReservationDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkin?: string; deposit?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const facility = await getCurrentFacility();
  const r = await prisma.reservation.findFirst({
    where: { id: Number(id), facilityId: facility.id },
    include: { payments: { orderBy: { createdAt: 'asc' } }, room: true },
  });
  if (!r) notFound();

  const status = effectiveStatus(r);
  const money = summarizeMoney(r, r.payments);
  const check = canCheckIn(r, todayJst());
  const canDeposit = status === '滞在中';

  return (
    <>
      <nav className="sub" aria-label="現在位置"><Link href="/reservations">予約</Link> ／ 予約詳細</nav>
      <div className="page-head">
        <div className="row" style={{ gap: 12 }}>
          <h1>{r.guestName} 様</h1>
          <span className={`tag ${statusTone(status)}`}>{status}</span>
          {r.localCheckedInAt && <span className="sub">この画面でチェックイン：{formatDateTimeJst(r.localCheckedInAt)}</span>}
          {r.isSample && <span className="tag warn">サンプル</span>}
        </div>
        <div className="row">
          <SettleButtons
            target={{
              id: r.id, guest: r.guestName, room: `${r.roomNumber ?? '未割当'} ${r.roomType ?? ''}`.trim(),
              stay: `${formatDateJa(r.arrival)} 〜 ${formatDateJa(r.departure)} ・ ${r.nights ?? '—'} 泊 ・ ${r.pax ?? '—'} 名`,
              settlement: r.settlement, billed: money.billed, receivedImport: money.receivedImport,
              paidHere: money.paidHere, remaining: money.remaining, depositBalance: money.depositBalance,
            }}
            canCheckin={check.ok}
            canDeposit={canDeposit}
            initial={sp.checkin ? 'checkin' : sp.deposit ? 'deposit' : null}
          />
          {r.arrival && <Link className="btn" href={`/indicator?date=${r.arrival}`}>インジケーターで見る</Link>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad stack">
          <h2>宿泊内容</h2>
          <dl className="kv">
            <dt>予約番号</dt><dd>{r.bookingNo ?? '—'}</dd>
            <dt>部屋</dt><dd>{r.roomNumber ?? '未割当'} {r.roomType}</dd>
            <dt>到着日</dt><dd>{formatDateJa(r.arrival, true)}</dd>
            <dt>出発日</dt><dd>{formatDateJa(r.departure, true)}</dd>
            <dt>泊数・人数</dt><dd>{r.nights ?? '—'} 泊 ・ {r.pax ?? '—'} 名</dd>
            <dt>グループ</dt><dd>{r.groupCode ?? '—'}</dd>
            <dt>チェックイン時間</dt><dd>{formatDateTimeJst(r.localCheckedInAt ?? r.checkedInAt)}</dd>
            <dt>販売経路</dt><dd>{r.channel ?? '—'}</dd>
            <dt>食事条件</dt><dd>{r.mealPlan ?? '—'}</dd>
            <dt>プラン・備考</dt><dd>{r.planName ?? '—'}</dd>
            <dt>電話番号</dt><dd>{r.phone ?? '—'}</dd>
          </dl>
          {r.frontNote && <div className="notice warn">フロント備考：{r.frontNote}</div>}
        </div>

        <div className="card card-pad stack">
          <h2>料金・精算</h2>
          <dl className="kv">
            <dt>決済方法</dt><dd>{r.settlement ?? '—'}</dd>
            <dt>泊ごとの料金</dt><dd>{yen(r.pricePerNight)}</dd>
            <dt>クーポン・ポイント</dt><dd>{yen(r.couponPoints)}</dd>
            <dt>合計（税込・割引後）</dt><dd>{yen(r.totalAmount)}</dd>
            <dt>追加費用</dt><dd>{yen(r.extraFee)}{r.extraDetail ? `（${r.extraDetail}）` : ''}</dd>
            <dt>ご請求</dt><dd>{yen(r.billed)}</dd>
            <dt>らく通で受領済み</dt><dd>{yen(money.receivedImport)}</dd>
            <dt>この画面で受領</dt><dd>{yen(money.paidHere)}</dd>
            <dt>未収</dt><dd style={{ color: money.remaining > 0 ? 'var(--warn-fg)' : undefined }}>{yen(money.remaining)}</dd>
            <dt>預り金残高</dt><dd style={{ color: 'var(--info-fg)' }}>{yen(money.depositBalance)}</dd>
          </dl>
          <h2 style={{ marginTop: 4 }}>入金・預り金の内訳</h2>
          {r.payments.length === 0 ? (
            <div className="sub">記録はありません。</div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>区分</th><th>方法</th><th className="num">金額</th><th>記録元</th><th>摘要・レジ</th></tr></thead>
                <tbody>
                  {r.payments.map((p) => (
                    <tr key={p.id}>
                      <td><span className={`tag${p.kind === 'deposit' ? ' deposit' : ''}`}>{KIND_LABEL[p.kind] ?? p.kind}</span></td>
                      <td>{formatMethod(p.method, p.brand)}</td>
                      <td className="num">{yen(p.amount)}</td>
                      <td className="sub">{p.source === 'import' ? 'らく通' : `この画面 ${formatDateTimeJst(p.createdAt)}`}</td>
                      <td className="sub">{[p.note, p.register].filter(Boolean).join(' ・ ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <dl className="kv">
          <dt>らく通 登録</dt><dd>{formatDateTimeJst(r.sourceCreatedAt)} ・ {r.sourceCreatedBy ?? '—'}</dd>
          <dt>らく通 最終更新</dt><dd>{formatDateTimeJst(r.sourceUpdatedAt)} ・ {r.sourceUpdatedBy ?? '—'}</dd>
          <dt>この画面への取込</dt><dd>{formatDateTimeJst(r.updatedAt)}</dd>
        </dl>
      </div>
    </>
  );
}
