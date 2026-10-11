'use client';

import { useActionState, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { needsBrand, splitAdvance, type PayMethodId } from '@/lib/settlement';
import { yen } from '@/lib/format';
import { advanceAction, advanceRefundAction, checkinSettleAction, checkoutAction, depositAction, type SettleResult } from './actions';

export type SettleTarget = {
  id: number;
  guest: string;
  room: string;
  stay: string;
  settlement: string | null;
  billed: number;
  paidHere: number;
  remaining: number;
  depositBalance: number;
  advanceBalance: number;
};

const DEPOSIT_PRESETS = [0, 5000, 10000, 20000, 30000];

function Done({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '16px 0' }} role="status">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#145C37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
      <div style={{ fontSize: 18, fontWeight: 700 }}>登録しました</div>
      <div style={{ maxWidth: 520 }}>{message}</div>
      <button type="button" className="btn primary" onClick={onClose}>閉じる</button>
    </div>
  );
}

function CheckinForm({ t, onClose, payOnly = false }: { t: SettleTarget; onClose: () => void; payOnly?: boolean }) {
  const [state, action, pending] = useActionState<SettleResult, FormData>(checkinSettleAction, null);
  const [method, setMethod] = useState<PayMethodId>('cash');
  const [brand, setBrand] = useState('');
  const [deposit, setDeposit] = useState(0);
  const [tendered, setTendered] = useState('');
  // 前受金があれば最初から「充当する」を選んでおく
  const [useAdvance, setUseAdvance] = useState(t.advanceBalance > 0);
  if (state?.ok) return <Done message={state.message} onClose={onClose} />;

  const adv = useAdvance ? splitAdvance(t.advanceBalance, t.remaining) : { applied: 0, toDeposit: 0 };
  const due = t.remaining - adv.applied;
  const total = due + deposit;
  const tenderedNum = Number(tendered.replace(/[^\d]/g, '')) || 0;
  const isCash = method === 'cash';
  const short = total > 0 && isCash && tenderedNum < total;
  const blocked = pending || (total > 0 && (needsBrand(method, brand) || short));

  return (
    <form action={action} className="settle-grid">
      <input type="hidden" name="reservationId" value={t.id} />
      <input type="hidden" name="expectedDue" value={t.remaining} />
      <input type="hidden" name="deposit" value={deposit} />
      <input type="hidden" name="useAdvance" value={useAdvance ? '1' : ''} />
      <input type="hidden" name="expectedAdvance" value={t.advanceBalance} />
      {payOnly && <input type="hidden" name="mode" value="pay" />}
      <div className="stack">
        <div className="money">
          <div><span>決済方法（らく通）</span><span>{t.settlement ?? '—'}</span></div>
          <div><span>現地でのお支払い</span><span>{yen(t.billed)}</span></div>
          {t.paidHere > 0 && <div><span>この画面で受領済み</span><span>−{yen(t.paidHere)}</span></div>}
          {adv.applied > 0 && <div className="advance"><span>前受金から充当</span><span>−{yen(adv.applied)}</span></div>}
          <div className="strong"><span>宿泊料等のお支払い</span><span>{yen(due)}</span></div>
          <div className="deposit"><span>預り金</span><span>{yen(deposit)}</span></div>
          {adv.toDeposit > 0 && <div className="deposit"><span>前受金の余り → 預り金へ振替</span><span>{yen(adv.toDeposit)}</span></div>}
          <div className="total"><span>お預かり合計</span><span>{yen(total)}</span></div>
        </div>
        {t.advanceBalance > 0 && (
          <div className="advance-box stack" style={{ gap: 8 }}>
            <span className="label">前受金（到着前にお預かり済み）残高 {yen(t.advanceBalance)}</span>
            <div className="pills cols-2" role="group" aria-label="前受金の扱い">
              <button type="button" className={`pill small${useAdvance ? ' on' : ''}`} aria-pressed={useAdvance} onClick={() => setUseAdvance(true)}>前受金から充当する</button>
              <button type="button" className={`pill small${!useAdvance ? ' on' : ''}`} aria-pressed={!useAdvance} onClick={() => setUseAdvance(false)}>使わない</button>
            </div>
            <span className="sub" style={{ fontSize: 12 }}>
              {useAdvance
                ? adv.toDeposit > 0 ? '宿泊料等に充当し、余りは預り金としてチェックアウト時に精算・返金します。' : '宿泊料等に充当します。不足分を下で受け取ってください。'
                : '前受金は残したままにします（チェックアウト時に返金します）。'}
            </span>
          </div>
        )}
        <div className="deposit-box stack" style={{ gap: 8 }}>
          <span className="label">預り金（前預かり）</span>
          <div className="pills auto" role="group" aria-label="預り金の金額">
            {DEPOSIT_PRESETS.map((v) => (
              <button key={v} type="button" className={`pill small${deposit === v ? ' on' : ''}`} aria-pressed={deposit === v} onClick={() => setDeposit(v)}>{v ? yen(v) : 'なし'}</button>
            ))}
          </div>
          <label className="field">金額を入力
            <input className="input" inputMode="numeric" value={deposit || ''} placeholder="0" onChange={(e) => setDeposit(Math.min(10_000_000, Number(e.target.value.replace(/[^\d]/g, '')) || 0))} />
          </label>
          <span className="sub" style={{ fontSize: 12 }}>滞在中の部屋付けに充当し、チェックアウト時に差額を精算・返金します。</span>
        </div>
      </div>
      <div className="stack">
        {total > 0 ? (
          <>
            <PaymentMethodPicker method={method} brand={brand} onMethod={setMethod} onBrand={setBrand} />
            {isCash && (
              <div className="stack" style={{ gap: 6 }}>
                <label className="field">お預り金額（現金）
                  <input className="input big" name="tendered" inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(total)} />
                </label>
                <div className="row">
                  <button type="button" className="btn small" onClick={() => setTendered(String(total))}>ちょうど</button>
                  <button type="button" className="btn small" onClick={() => setTendered(String(tenderedNum + 1000))}>＋¥1,000</button>
                  <button type="button" className="btn small" onClick={() => setTendered(String(tenderedNum + 10000))}>＋¥10,000</button>
                </div>
                <div className="money"><div className="strong"><span>お釣り</span><span>{yen(Math.max(0, tenderedNum - total))}</span></div></div>
                {short && tendered !== '' && <span className="field-error">お預り金額が {yen(total - tenderedNum)} 不足しています</span>}
              </div>
            )}
          </>
        ) : (
          <div className="notice ok">{adv.applied > 0 ? '前受金で全額を充当するため、' : t.billed === 0 ? '事前決済・法人決済のため、' : ''}お支払いはありません。必要なら左で預り金を指定してください。</div>
        )}
        {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
        <button type="submit" className="btn primary big" disabled={blocked}>{pending ? '登録中…' : payOnly ? '精算する' : total > 0 ? '精算してチェックイン' : 'チェックインする'}</button>
      </div>
    </form>
  );
}

function DepositForm({ t, onClose }: { t: SettleTarget; onClose: () => void }) {
  const [state, action, pending] = useActionState<SettleResult, FormData>(depositAction, null);
  const [method, setMethod] = useState<PayMethodId>('cash');
  const [brand, setBrand] = useState('');
  const [amount, setAmount] = useState(10000);
  if (state?.ok) return <Done message={state.message} onClose={onClose} />;
  const blocked = pending || amount <= 0 || needsBrand(method, brand);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="reservationId" value={t.id} />
      <input type="hidden" name="amount" value={amount} />
      <div className="money">
        <div className="deposit"><span>現在の預り金</span><span>{yen(t.depositBalance)}</span></div>
        <div className="total"><span>登録後の預り金</span><span>{yen(t.depositBalance + amount)}</span></div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="label">お預かりする金額</span>
        <div className="pills auto" role="group" aria-label="金額">
          {[5000, 10000, 20000, 30000, 50000].map((v) => (
            <button key={v} type="button" className={`pill small${amount === v ? ' on' : ''}`} aria-pressed={amount === v} onClick={() => setAmount(v)}>{yen(v)}</button>
          ))}
        </div>
        <label className="field">金額を入力
          <input className="input big" inputMode="numeric" value={amount || ''} placeholder="0" onChange={(e) => setAmount(Math.min(10_000_000, Number(e.target.value.replace(/[^\d]/g, '')) || 0))} />
        </label>
      </div>
      <PaymentMethodPicker method={method} brand={brand} onMethod={setMethod} onBrand={setBrand} />
      <label className="field">摘要（任意）<input className="input" name="note" maxLength={200} placeholder="例：滞在中の飲食・売店用" /></label>
      {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
      <button type="submit" className="btn primary big" disabled={blocked}>{pending ? '登録中…' : amount > 0 ? `${yen(amount)} を預り金として登録` : '金額を入力してください'}</button>
    </form>
  );
}

function CheckoutForm({ t, onClose }: { t: SettleTarget; onClose: () => void }) {
  const [state, action, pending] = useActionState<SettleResult, FormData>(checkoutAction, null);
  const [method, setMethod] = useState<PayMethodId>('cash');
  const [brand, setBrand] = useState('');
  if (state?.ok) return <Done message={state.message} onClose={onClose} />;
  const advanceLeft = Math.max(0, t.advanceBalance);
  const refund = t.depositBalance + advanceLeft;
  const blocked = pending || t.remaining > 0 || (refund > 0 && needsBrand(method, brand));
  return (
    <form action={action} className="stack">
      <input type="hidden" name="reservationId" value={t.id} />
      <input type="hidden" name="expectedRefund" value={refund} />
      <div className="money">
        <div><span>未収</span><span>{yen(t.remaining)}</span></div>
        <div className="deposit"><span>預り金の残高</span><span>{yen(t.depositBalance)}</span></div>
        {advanceLeft > 0 && <div className="advance"><span>使わなかった前受金</span><span>{yen(advanceLeft)}</span></div>}
        <div className="total"><span>返金する金額</span><span>{yen(refund)}</span></div>
      </div>
      {t.remaining > 0 && <div className="notice error">未収があるためチェックアウトできません。先にチェックイン精算で受け取ってください。</div>}
      {refund > 0 ? (
        <>
          <div className="sub">部屋付けの精算は次の版で対応するため、預り金は全額を返金します。返金の方法を選んでください。</div>
          <PaymentMethodPicker method={method} brand={brand} onMethod={setMethod} onBrand={setBrand} />
        </>
      ) : (
        <div className="sub">預り金はありません。</div>
      )}
      {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
      <button type="submit" className="btn primary big" disabled={blocked}>{pending ? '登録中…' : refund > 0 ? `${yen(refund)} を返金してチェックアウト` : 'チェックアウトする'}</button>
    </form>
  );
}

const ADVANCE_PRESETS = [5000, 10000, 20000, 30000, 50000];

/** 前受金の登録（チェックイン前に受け取ったお金を予約に割り当てておく） */
function AdvanceForm({ t, onClose }: { t: SettleTarget; onClose: () => void }) {
  const [state, action, pending] = useActionState<SettleResult, FormData>(advanceAction, null);
  const [method, setMethod] = useState<PayMethodId>('transfer');
  const [brand, setBrand] = useState('');
  const [amount, setAmount] = useState(Math.max(0, t.remaining - t.advanceBalance));
  if (state?.ok) return <Done message={state.message} onClose={onClose} />;
  const blocked = pending || amount <= 0 || needsBrand(method, brand);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="reservationId" value={t.id} />
      <input type="hidden" name="amount" value={amount} />
      <div className="money">
        <div><span>宿泊料等の未収</span><span>{yen(t.remaining)}</span></div>
        <div className="advance"><span>現在の前受金</span><span>{yen(t.advanceBalance)}</span></div>
        <div className="total"><span>登録後の前受金</span><span>{yen(t.advanceBalance + amount)}</span></div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="label">前受金の金額</span>
        <div className="pills auto" role="group" aria-label="金額">
          {t.remaining > t.advanceBalance && (
            <button type="button" className={`pill small${amount === t.remaining - t.advanceBalance ? ' on' : ''}`} onClick={() => setAmount(t.remaining - t.advanceBalance)}>未収の全額</button>
          )}
          {ADVANCE_PRESETS.map((v) => (
            <button key={v} type="button" className={`pill small${amount === v ? ' on' : ''}`} aria-pressed={amount === v} onClick={() => setAmount(v)}>{yen(v)}</button>
          ))}
        </div>
        <label className="field">金額を入力
          <input className="input big" inputMode="numeric" value={amount || ''} placeholder="0" onChange={(e) => setAmount(Math.min(10_000_000, Number(e.target.value.replace(/[^\d]/g, '')) || 0))} />
        </label>
      </div>
      <PaymentMethodPicker method={method} brand={brand} onMethod={setMethod} onBrand={setBrand} allowTransfer />
      <label className="field">摘要（任意）<input className="input" name="note" maxLength={200} placeholder="例：10/5 振込・振込名義 ヤマダタロウ" /></label>
      <div className="sub" style={{ fontSize: 12 }}>チェックインのときに「前受金から充当する」を選ぶと、宿泊料等に充当されます。</div>
      {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
      <button type="submit" className="btn primary big" disabled={blocked}>{pending ? '登録中…' : amount > 0 ? `${yen(amount)} を前受金として登録` : '金額を入力してください'}</button>
    </form>
  );
}

/** 前受金の返金（取消・過入金のとき） */
function AdvanceRefundForm({ t, onClose }: { t: SettleTarget; onClose: () => void }) {
  const [state, action, pending] = useActionState<SettleResult, FormData>(advanceRefundAction, null);
  const [method, setMethod] = useState<PayMethodId>('cash');
  const [brand, setBrand] = useState('');
  const [amount, setAmount] = useState(t.advanceBalance);
  if (state?.ok) return <Done message={state.message} onClose={onClose} />;
  const over = amount > t.advanceBalance;
  const blocked = pending || amount <= 0 || over || needsBrand(method, brand);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="reservationId" value={t.id} />
      <input type="hidden" name="amount" value={amount} />
      <div className="money">
        <div className="advance"><span>前受金の残高</span><span>{yen(t.advanceBalance)}</span></div>
        <div className="total"><span>返金後の前受金</span><span>{yen(t.advanceBalance - amount)}</span></div>
      </div>
      <label className="field">返金する金額
        <input className="input big" inputMode="numeric" value={amount || ''} placeholder="0" onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g, '')) || 0)} />
      </label>
      {over && <span className="field-error">前受金の残高を超えています</span>}
      <PaymentMethodPicker method={method} brand={brand} onMethod={setMethod} onBrand={setBrand} allowTransfer />
      <label className="field">摘要（任意）<input className="input" name="note" maxLength={200} placeholder="例：予約取消のため返金" /></label>
      {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
      <button type="submit" className="btn danger big" disabled={blocked}>{pending ? '登録中…' : `${yen(amount)} を返金する`}</button>
    </form>
  );
}

export function SettleButtons({ target, canCheckin, checkinReason, canDeposit, canCheckout, canPay, canAdvance, initial }: {
  target: SettleTarget;
  canCheckin: boolean;
  checkinReason?: string;
  canDeposit: boolean;
  canCheckout: boolean;
  /** チェックイン後に未収が残っている */
  canPay: boolean;
  /** チェックイン前で、前受金を登録できる */
  canAdvance: boolean;
  initial: 'checkin' | 'deposit' | 'checkout' | 'advance' | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'checkin' | 'deposit' | 'checkout' | 'pay' | 'advance' | 'advanceRefund' | null>(
    initial === 'checkin' && canCheckin ? 'checkin'
      : initial === 'deposit' && canDeposit ? 'deposit'
        : initial === 'checkout' && canCheckout ? 'checkout'
          : initial === 'advance' && canAdvance ? 'advance' : null,
  );
  const close = useCallback(() => {
    setOpen(null);
    router.replace(`/reservations/${target.id}`, { scroll: false });
    router.refresh();
  }, [router, target.id]);
  const subtitle = (
    <>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{target.guest} 様</div>
      <div className="sub">{target.room} ・ {target.stay}</div>
    </>
  );
  return (
    <>
      {canCheckin && <button type="button" className="btn primary" onClick={() => setOpen('checkin')}>チェックイン精算</button>}
      {!canCheckin && checkinReason && <span className="sub" title={checkinReason}>{checkinReason}</span>}
      {canPay && <button type="button" className="btn primary" onClick={() => setOpen('pay')}>未収を精算</button>}
      {canAdvance && <button type="button" className="btn" onClick={() => setOpen('advance')}>前受金を登録</button>}
      {canAdvance && target.advanceBalance > 0 && <button type="button" className="btn" onClick={() => setOpen('advanceRefund')}>前受金を返金</button>}
      {canDeposit && <button type="button" className="btn" onClick={() => setOpen('deposit')}>預り金を登録</button>}
      {canCheckout && <button type="button" className="btn" onClick={() => setOpen('checkout')}>チェックアウト</button>}
      {open === 'checkin' && <Modal title="チェックイン精算" subtitle={subtitle} onClose={close} width={900}><CheckinForm t={target} onClose={close} /></Modal>}
      {open === 'deposit' && <Modal title="預り金の登録（前預かり）" subtitle={subtitle} onClose={close} width={560}><DepositForm t={target} onClose={close} /></Modal>}
      {open === 'pay' && <Modal title="未収の精算" subtitle={subtitle} onClose={close} width={900}><CheckinForm t={target} onClose={close} payOnly /></Modal>}
      {open === 'advance' && <Modal title="前受金の登録（チェックイン前のお預かり）" subtitle={subtitle} onClose={close} width={560}><AdvanceForm t={target} onClose={close} /></Modal>}
      {open === 'advanceRefund' && <Modal title="前受金の返金" subtitle={subtitle} onClose={close} width={560}><AdvanceRefundForm t={target} onClose={close} /></Modal>}
      {open === 'checkout' && <Modal title="チェックアウト" subtitle={subtitle} onClose={close} width={560}><CheckoutForm t={target} onClose={close} /></Modal>}
    </>
  );
}
