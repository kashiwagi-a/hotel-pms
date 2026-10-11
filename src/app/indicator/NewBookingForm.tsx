'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { addDays } from '@/lib/dates';
import { formatDateJa, yen } from '@/lib/format';
import { needsBrand, type PayMethodId } from '@/lib/settlement';
import { NEW_BOOKING_CHANNELS, NEW_BOOKING_SETTLEMENTS } from '@/lib/new-booking';
import { createBookingAction, type CreateBookingResult } from './actions';

export type BookingRoom = { id: number; number: string; type: string; capacity: number | null; freeNights: number };

const yenInput = (v: string) => Math.min(10_000_000, Number(v.normalize('NFKC').replace(/[^\d]/g, '')) || 0);

/** インジケーターで選んだ部屋に、新しい予約を作る（電話・飛び込みなど） */
export function NewBookingForm({ room, date, channels, onClose }: { room: BookingRoom; date: string; channels: string[]; onClose: () => void }) {
  const [state, action, pending] = useActionState<CreateBookingResult, FormData>(createBookingAction, null);
  const [nights, setNights] = useState(1);
  const [settlement, setSettlement] = useState<string>(NEW_BOOKING_SETTLEMENTS[0].value);
  const [total, setTotal] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [method, setMethod] = useState<PayMethodId>('cash');
  const [brand, setBrand] = useState('');

  if (state?.ok) {
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '16px 0' }} role="status">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#145C37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
        <div style={{ fontSize: 18, fontWeight: 700 }}>予約を作成しました</div>
        <div style={{ maxWidth: 520 }}>{state.message}</div>
        <div className="row" style={{ justifyContent: 'center' }}>
          {state.canCheckinNow && <Link className="btn primary" href={`/reservations/${state.reservationId}?checkin=1`}>このままチェックイン精算へ</Link>}
          <Link className="btn" href={`/reservations/${state.reservationId}`}>予約詳細</Link>
          <button type="button" className="btn" onClick={onClose}>閉じる</button>
        </div>
      </div>
    );
  }

  const maxNights = Math.max(1, room.freeNights);
  const onSite = NEW_BOOKING_SETTLEMENTS.find((s) => s.value === settlement)?.onSite ?? true;
  const channelOptions = [...new Set([...NEW_BOOKING_CHANNELS, ...channels])];
  const blocked = pending || (advance > 0 && needsBrand(method, brand));

  return (
    <form action={action} className="settle-grid">
      <input type="hidden" name="roomId" value={room.id} />
      <input type="hidden" name="arrival" value={date} />
      <input type="hidden" name="nights" value={nights} />
      <input type="hidden" name="settlement" value={settlement} />
      <input type="hidden" name="totalAmount" value={total} />
      <input type="hidden" name="advance" value={advance} />

      <div className="stack">
        <div className="money">
          <div><span>部屋</span><span><b>{room.number}</b> {room.type}</span></div>
          <div><span>チェックイン</span><span>{formatDateJa(date, true)}</span></div>
          <div className="strong"><span>チェックアウト</span><span>{formatDateJa(addDays(date, nights), true)}</span></div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">泊数</span>
          <div className="row">
            <button type="button" className="btn small" aria-label="1 泊減らす" disabled={nights <= 1} onClick={() => setNights(nights - 1)}>−</button>
            <input className="input" style={{ width: 72, textAlign: 'right' }} inputMode="numeric" aria-label="泊数" value={nights}
              onChange={(e) => setNights(Math.min(maxNights, Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1)))} />
            <button type="button" className="btn small" aria-label="1 泊増やす" disabled={nights >= maxNights} onClick={() => setNights(nights + 1)}>＋</button>
            <span className="sub">{room.freeNights >= 30 ? '30 泊まで' : `この部屋は ${room.freeNights} 泊まで`}空いています</span>
          </div>
        </div>
        <label className="field">お客様名（必須）<input className="input" name="guestName" required maxLength={100} placeholder="例：山田 太郎" autoComplete="off" /></label>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 90 }}>人数<input className="input" name="pax" inputMode="numeric" defaultValue={1} /></label>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>電話番号<input className="input" name="phone" inputMode="tel" maxLength={30} autoComplete="off" /></label>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>エージェント・経路
            <select className="input" name="channel" defaultValue={NEW_BOOKING_CHANNELS[0]}>
              {channelOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>プラン<input className="input" name="planName" maxLength={100} placeholder="例：素泊まり" /></label>
        </div>
        <label className="field">予約メモ<textarea className="input" name="memo" rows={2} maxLength={500} /></label>
      </div>

      <div className="stack">
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">決済方法</span>
          <div className="pills" role="group" aria-label="決済方法">
            {NEW_BOOKING_SETTLEMENTS.map((s) => (
              <button key={s.value} type="button" className={`pill small${settlement === s.value ? ' on' : ''}`} aria-pressed={settlement === s.value} onClick={() => setSettlement(s.value)}>{s.label}</button>
            ))}
          </div>
        </div>
        <label className="field">宿泊料金（合計・税込）
          <input className="input big" inputMode="numeric" value={total || ''} placeholder="0" onChange={(e) => setTotal(yenInput(e.target.value))} />
        </label>
        <div className="money">
          <div className="strong"><span>現地でのお支払い</span><span>{yen(onSite ? total : 0)}</span></div>
          {advance > 0 && <div className="advance"><span>前受金（チェックイン時に充当）</span><span>−{yen(advance)}</span></div>}
          {advance > 0 && onSite && <div><span>チェックイン時の残り</span><span>{yen(Math.max(0, total - advance))}</span></div>}
        </div>

        <div className="advance-box stack" style={{ gap: 8 }}>
          <span className="label">前受金（任意・先に受け取っている場合）</span>
          <div className="row">
            <input className="input" style={{ flex: 1, textAlign: 'right' }} inputMode="numeric" aria-label="前受金の金額" value={advance || ''} placeholder="0" onChange={(e) => setAdvance(yenInput(e.target.value))} />
            {onSite && total > 0 && <button type="button" className="btn small" onClick={() => setAdvance(total)}>全額</button>}
            {advance > 0 && <button type="button" className="btn small" onClick={() => setAdvance(0)}>なし</button>}
          </div>
          {advance > 0 && <PaymentMethodPicker method={method} brand={brand} onMethod={setMethod} onBrand={setBrand} allowTransfer />}
        </div>

        {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
        <button type="submit" className="btn primary big" disabled={blocked}>{pending ? '作成中…' : `${room.number} 号室で予約を作成`}</button>
      </div>
    </form>
  );
}
