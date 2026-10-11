'use client';

import { useActionState, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { BRANDS, type PayMethodId } from '@/lib/settlement';
import { yen } from '@/lib/format';
import { checkinSettleAction, depositAction, type SettleResult } from './actions';

export type SettleTarget = {
  id: number;
  guest: string;
  room: string;
  stay: string;
  settlement: string | null;
  billed: number;
  receivedImport: number;
  paidHere: number;
  remaining: number;
  depositBalance: number;
};

const DEPOSIT_PRESETS = [0, 5000, 10000, 20000, 30000];

function needsBrand(method: PayMethodId, brand: string) {
  return method !== 'cash' && !BRANDS[method].list.includes(brand);
}

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

function CheckinForm({ t, onClose }: { t: SettleTarget; onClose: () => void }) {
  const [state, action, pending] = useActionState<SettleResult, FormData>(checkinSettleAction, null);
  const [method, setMethod] = useState<PayMethodId>('cash');
  const [brand, setBrand] = useState('');
  const [deposit, setDeposit] = useState(0);
  const [tendered, setTendered] = useState('');
  if (state?.ok) return <Done message={state.message} onClose={onClose} />;

  const total = t.remaining + deposit;
  const tenderedNum = Number(tendered.replace(/[^\d]/g, '')) || 0;
  const isCash = method === 'cash';
  const short = total > 0 && isCash && tenderedNum < total;
  const blocked = pending || (total > 0 && (needsBrand(method, brand) || short));

  return (
    <form action={action} className="settle-grid">
      <input type="hidden" name="reservationId" value={t.id} />
      <input type="hidden" name="expectedDue" value={t.remaining} />
      <input type="hidden" name="deposit" value={deposit} />
      <div className="stack">
        <div className="money">
          <div><span>決済方法（らく通）</span><span>{t.settlement ?? '—'}</span></div>
          <div><span>ご請求</span><span>{yen(t.billed)}</span></div>
          {t.receivedImport > 0 && <div><span>らく通で受領済み</span><span>−{yen(t.receivedImport)}</span></div>}
          {t.paidHere > 0 && <div><span>この画面で受領済み</span><span>−{yen(t.paidHere)}</span></div>}
          <div className="strong"><span>宿泊料等のお支払い</span><span>{yen(t.remaining)}</span></div>
          <div className="deposit"><span>預り金</span><span>{yen(deposit)}</span></div>
          <div className="total"><span>お預かり合計</span><span>{yen(total)}</span></div>
        </div>
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
          <div className="notice ok">{t.settlement === '精算不要' ? '予約サイトで決済済みのため、' : ''}お支払いはありません。必要なら左で預り金を指定してください。</div>
        )}
        {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
        <button type="submit" className="btn primary big" disabled={blocked}>{pending ? '登録中…' : total > 0 ? '精算してチェックイン' : 'チェックインする'}</button>
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

export function SettleButtons({ target, canCheckin, checkinReason, canDeposit, initial }: {
  target: SettleTarget;
  canCheckin: boolean;
  checkinReason?: string;
  canDeposit: boolean;
  initial: 'checkin' | 'deposit' | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'checkin' | 'deposit' | null>(
    initial === 'checkin' && canCheckin ? 'checkin' : initial === 'deposit' && canDeposit ? 'deposit' : null,
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
      {canDeposit && <button type="button" className="btn" onClick={() => setOpen('deposit')}>預り金を登録</button>}
      {open === 'checkin' && <Modal title="チェックイン精算" subtitle={subtitle} onClose={close} width={900}><CheckinForm t={target} onClose={close} /></Modal>}
      {open === 'deposit' && <Modal title="預り金の登録（前預かり）" subtitle={subtitle} onClose={close} width={560}><DepositForm t={target} onClose={close} /></Modal>}
    </>
  );
}
