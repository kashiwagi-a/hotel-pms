'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CHIPS, STATE_LABEL, type RoomState } from '@/lib/indicator';
import { Modal } from '@/components/Modal';
import { formatDateJa } from '@/lib/format';
import { assignRoomAction, autoAssignAction, unassignRoomAction, type AssignResult } from './actions';
import { NewBookingForm } from './NewBookingForm';

export type BoardRoom = {
  id: number;
  number: string;
  type: string;
  typeCode: string | null;
  outOfOrder: boolean;
  state: RoomState;
  dot: boolean;
  reservationId: number | null;
  guest: string | null;
  bookingNo: string | null;
  stay: string | null;
  pax: number | null;
  roomCount: number;
  bookedType: string | null;
  typeMismatch: boolean;
  channel: string | null;
  plan: string | null;
  settlement: string | null;
  unpaid: string | null;
  deposit: string | null;
  /** 前受金の残高（チェックイン時に充当） */
  advance: string | null;
  memo: string | null;
  canCheckin: boolean;
  canDeposit: boolean;
  canCheckout: boolean;
  canUnassign: boolean;
  /** チェックイン前で前受金を登録できる */
  canAdvance: boolean;
  /** 今夜空いていて、この部屋で新しい予約を作れる */
  canBook: boolean;
  /** 新しい予約で何泊まで空いているか */
  freeNights: number;
  capacity: number | null;
  /** 本日出発予定でまだ在室のお客様（今夜の予約とは別） */
  dueOutGuest: string | null;
};

export type BoardFloor = { label: string; building?: string | null; rooms: BoardRoom[] };

export type UnassignedBooking = {
  id: number;
  guest: string;
  arrival: string;
  nights: number | null;
  pax: number | null;
  roomType: string;
  roomTypeCode: string | null;
  roomCount: number;
  assigned: number;
  channel: string | null;
  memo: string | null;
  /** タイプが一致する空室 */
  sameTypeFree: number[];
  /** タイプは違うが空いている部屋 */
  otherFree: number[];
};

const TIP_W = 300;
const TIP_H = 260;

/** カーソルの右下に出し、画面の端では反対側に回り込ませる */
function place(x: number, y: number, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: x + 16 + w > vw ? Math.max(8, x - w - 16) : x + 16,
    top: y + 18 + h > vh ? Math.max(8, y - h - 12) : y + 18,
  };
}

function RoomInfo({ room }: { room: BoardRoom }) {
  return (
    <>
      <div className="head"><span className="no">{room.number}</span><span className="sub">{room.type}</span></div>
      <div><span className={`tag st-${room.state}`} style={{ boxShadow: 'none' }}>{STATE_LABEL[room.state]}</span></div>
      {room.guest && (
        <>
          <div className="guest">{room.guest} 様</div>
          {room.stay && <div className="sub">{room.stay}{room.pax ? ` ・ ${room.pax} 名` : ''}{room.roomCount > 1 ? ` ・ ${room.roomCount} 室の予約` : ''}</div>}
          {(room.channel || room.bookingNo) && <div className="sub">{[room.channel, room.bookingNo].filter(Boolean).join(' ・ ')}</div>}
          {room.typeMismatch && <div style={{ color: 'var(--warn-fg)' }}>予約の室タイプ：{room.bookedType}</div>}
          {room.plan && <div>{room.plan}</div>}
          {room.settlement && <div className="sub">{room.settlement}</div>}
          {room.unpaid && <div style={{ fontWeight: 500, color: 'var(--warn-fg)' }}>未収：{room.unpaid}</div>}
          {room.deposit && <div style={{ fontWeight: 500, color: 'var(--info-fg)' }}>預り金：{room.deposit}</div>}
          {room.advance && <div style={{ fontWeight: 500, color: 'var(--advance-fg)' }}>前受金：{room.advance}</div>}
        </>
      )}
      {!room.guest && room.state === 'C' && <div className="sub">空室です。{room.canBook ? `${room.freeNights >= 30 ? '30 泊以上' : `${room.freeNights} 泊まで`}空いています。` : ''}</div>}
      {!room.guest && room.state === 'X' && <div className="sub">故障・使用停止中です。客室マスタで解除できます。</div>}
      {room.memo && <div className="memo">予約メモ：{room.memo}</div>}
      {room.dueOutGuest && <div className="memo">本日出発予定の {room.dueOutGuest} 様がまだ在室です（清掃前）。</div>}
    </>
  );
}

export function IndicatorBoard({ date, floors, unassigned, channels }: { date: string; floors: BoardFloor[]; unassigned: UnassignedBooking[]; channels: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [pin, setPin] = useState<{ id: number; left: number; top: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<AssignResult | null>(null);
  const [booking, setBooking] = useState<number | null>(null);

  const all = useMemo(() => floors.flatMap((f) => f.rooms), [floors]);
  const counts = useMemo(() => {
    const c: Record<RoomState, number> = { S: 0, N: 0, T: 0, A: 0, O: 0, C: 0, X: 0 };
    for (const r of all) c[r.state]++;
    return c;
  }, [all]);

  const sel = unassigned.find((u) => u.id === selected) ?? null;
  const sameType = new Set(sel?.sameTypeFree ?? []);
  const otherType = new Set(sel?.otherFree ?? []);

  const active = new Set<RoomState>();
  for (const chip of CHIPS) if (filters[chip.key]) chip.match.forEach((m) => active.add(m));

  const hoverRoom = hover && hover.id !== pin?.id ? all.find((r) => r.id === hover.id) : undefined;
  const pinRoom = pin ? all.find((r) => r.id === pin.id) : undefined;
  const bookingRoom = booking !== null ? all.find((r) => r.id === booking) : undefined;
  const closeBooking = () => {
    setBooking(null);
    router.refresh();
  };
  const tipPos = hover && hoverRoom ? place(hover.x, hover.y, TIP_W, TIP_H) : null;

  const run = (fn: () => Promise<AssignResult>) => {
    startTransition(async () => {
      const result = await fn();
      setNotice(result);
      if (result.ok) {
        setPin(null);
        router.refresh();
      }
    });
  };

  const moveHover = (id: number, x: number, y: number) => {
    setHover((h) => (h && h.id === id && Math.abs(h.x - x) + Math.abs(h.y - y) < 4 ? h : { id, x, y }));
  };

  const onRoomClick = (room: BoardRoom, e: React.MouseEvent<HTMLButtonElement>) => {
    // 予約を選んでいるときは、空室をクリックすると割り当てる
    if (sel && (sameType.has(room.id) || otherType.has(room.id))) {
      if (otherType.has(room.id) && !window.confirm(`予約の室タイプは「${sel.roomType}」ですが、${room.number} 号室は「${room.type}」です。割り当てますか？`)) return;
      const remaining = sel.roomCount - sel.assigned - 1;
      if (remaining <= 0) setSelected(null);
      run(() => assignRoomAction(sel.id, room.id));
      return;
    }
    if (pin?.id === room.id) {
      setPin(null);
      return;
    }
    // 空室をクリックしたら、その部屋で予約を作る
    if (!sel && room.state === 'C' && room.canBook) {
      setPin(null);
      setHover(null);
      setBooking(room.id);
      return;
    }
    let x = e.clientX;
    let y = e.clientY;
    if (!x && !y) {
      const b = e.currentTarget.getBoundingClientRect();
      x = b.right - 8;
      y = b.bottom - 8;
    }
    const p = place(x, y, TIP_W, 360);
    setPin({ id: room.id, left: p.left + window.scrollX, top: p.top + window.scrollY });
    setHover(null);
  };

  return (
    <>
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2>部屋割りが必要な予約</h2>
            <span style={{ fontWeight: 500, color: unassigned.length ? 'var(--warn-fg)' : 'var(--ok-fg)' }}>{unassigned.length} 件</span>
          </div>
          <div className="row">
            {sel && <button type="button" className="btn small" onClick={() => setSelected(null)}>選択を取消</button>}
            <button type="button" className="btn small primary" disabled={pending || unassigned.length === 0} onClick={() => run(() => autoAssignAction(date))}>
              自動で部屋割り（タイプ一致・低層階から）
            </button>
          </div>
        </div>
        {unassigned.length === 0 && <div className="sub">この日に泊まる予約は、すべて部屋割りが済んでいます。</div>}
        <div className="row" style={{ alignItems: 'stretch' }}>
          {unassigned.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`pick${selected === u.id ? ' on' : ''}`}
              aria-pressed={selected === u.id}
              onClick={() => { setSelected(selected === u.id ? null : u.id); setPin(null); }}
            >
              <span style={{ fontWeight: 700 }}>{u.guest} 様 <span className="sub" style={{ fontWeight: 400 }}>{u.arrival} から {u.nights ?? '?'} 泊</span></span>
              <span className="sub">{u.roomTypeCode && <b>{u.roomTypeCode} </b>}{u.roomType} ・ {u.pax ?? '?'} 名 ・ 割当 {u.assigned} / {u.roomCount} 室</span>
              <span className="sub" style={{ color: u.sameTypeFree.length < u.roomCount - u.assigned ? 'var(--danger)' : undefined }}>
                同タイプの空室 {u.sameTypeFree.length} 室{u.channel ? ` ・ ${u.channel}` : ''}
              </span>
            </button>
          ))}
        </div>
        {sel && (
          <div className="notice ok" style={{ background: 'var(--accent-soft)', color: 'var(--info-fg)', borderColor: '#bfd7ea' }}>
            {sel.guest} 様（{sel.roomType}）に割り当てる部屋をクリックしてください。濃い枠がタイプの合う空室、点線の枠がタイプの違う空室です。
          </div>
        )}
        {notice && <div className={`notice ${notice.ok ? 'ok' : 'error'}`} role="status">{notice.ok ? notice.message : notice.error}</div>}
      </div>

      <div className="chips" role="group" aria-label="状態で絞り込み">
        {CHIPS.map((chip) => {
          const count = chip.match.reduce((s, m) => s + counts[m], 0);
          if (chip.hideIfZero && count === 0) return null;
          return (
            <label key={chip.key} className={`chip${filters[chip.key] ? ' on' : ''}`}>
              <input
                type="checkbox"
                className={`sw-${chip.swatch}`}
                checked={!!filters[chip.key]}
                onChange={() => setFilters((f) => ({ ...f, [chip.key]: !f[chip.key] }))}
              />
              <span>{chip.label}</span>
              <b>{count}</b>
            </label>
          );
        })}
        {active.size > 0 && <button className="btn small" type="button" onClick={() => setFilters({})}>絞り込みを解除</button>}
        <span className="sub row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2a2f5a', display: 'inline-block' }} />予約メモあり</span>
      </div>

      <div className="card floors" aria-label="フロア別客室一覧">
        {floors.map((floor, i) => (
          <div className="floor" key={floor.label}>
            <div className="floor-label">
              {floor.building && floor.building !== floors[i - 1]?.building && <span className="floor-building">{floor.building}</span>}
              {floor.label}
            </div>
            <div className="rooms">
              {floor.rooms.map((room) => {
                const cand = sel ? (sameType.has(room.id) ? 'same' : otherType.has(room.id) ? 'other' : null) : null;
                const dim = sel ? !cand : active.size > 0 && !active.has(room.state);
                return (
                  <button
                    key={room.id}
                    type="button"
                    className={`rm st-${room.state}${dim ? ' dim' : ''}${pin?.id === room.id ? ' pinned' : ''}${cand ? ` cand-${cand}` : ''}`}
                    aria-label={`${room.number}号室 ${room.type} ${STATE_LABEL[room.state]}${room.guest ? ` ${room.guest}様` : ''}${cand ? ' 割り当てできます' : ''}`}
                    disabled={pending}
                    onMouseEnter={(e) => moveHover(room.id, e.clientX, e.clientY)}
                    onMouseMove={(e) => moveHover(room.id, e.clientX, e.clientY)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); moveHover(room.id, b.right - 8, b.bottom - 8); }}
                    onBlur={() => setHover(null)}
                    onClick={(e) => onRoomClick(room, e)}
                  >
                    {room.number}
                    {room.dot && <span className="dot" aria-hidden="true" />}
                    {room.dueOutGuest && <span className="dueout" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hoverRoom && tipPos && (
        <div className="popover tip" role="tooltip" style={{ left: tipPos.left, top: tipPos.top }}>
          <RoomInfo room={hoverRoom} />
          <div className="hint">
            {sel
              ? sameType.has(hoverRoom.id) ? `クリックで ${sel.guest} 様に割り当て`
                : otherType.has(hoverRoom.id) ? `タイプが違います（クリックで確認して割り当て）` : '割り当てできません'
              : hoverRoom.state === 'C' && hoverRoom.canBook ? 'クリックでこの部屋の予約を作成' : 'クリックで固定表示'}
          </div>
        </div>
      )}

      {pinRoom && pin && (
        <div className="popover pin" role="dialog" aria-label={`${pinRoom.number}号室の詳細`} style={{ left: pin.left, top: pin.top }}>
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: -8 }}>
            <button type="button" className="icon-btn" aria-label="閉じる" onClick={() => setPin(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <RoomInfo room={pinRoom} />
          {pinRoom.canBook && (
            <div className="row" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
              <button type="button" className="btn small primary" onClick={() => { setPin(null); setBooking(pinRoom.id); }}>今夜からこの部屋で予約を作成</button>
            </div>
          )}
          {pinRoom.reservationId && (
            <div className="row" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
              {pinRoom.canCheckin && <Link className="btn small primary" href={`/reservations/${pinRoom.reservationId}?checkin=1`}>チェックイン精算</Link>}
              {pinRoom.canAdvance && <Link className="btn small" href={`/reservations/${pinRoom.reservationId}?advance=1`}>前受金を登録</Link>}
              {pinRoom.canDeposit && <Link className="btn small" href={`/reservations/${pinRoom.reservationId}?deposit=1`}>預り金を登録</Link>}
              {pinRoom.canCheckout && <Link className="btn small" href={`/reservations/${pinRoom.reservationId}?checkout=1`}>チェックアウト</Link>}
              {pinRoom.canUnassign && (
                <button
                  type="button"
                  className="btn small danger"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`${pinRoom.number} 号室の割り当てを外しますか？`)) run(() => unassignRoomAction(pinRoom.reservationId!, pinRoom.id));
                  }}
                >
                  割り当てを外す
                </button>
              )}
              <Link className="btn small" href={`/reservations/${pinRoom.reservationId}`}>予約詳細</Link>
            </div>
          )}
        </div>
      )}

      {bookingRoom && (
        <Modal
          title="新しい予約（インジケーターから作成）"
          subtitle={<div style={{ fontSize: 18, fontWeight: 700 }}>{bookingRoom.number} 号室 ・ {formatDateJa(date, true)} から</div>}
          onClose={closeBooking}
          width={900}
        >
          <NewBookingForm room={bookingRoom} date={date} channels={channels} onClose={closeBooking} />
        </Modal>
      )}
    </>
  );
}
