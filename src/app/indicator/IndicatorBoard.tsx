'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CHIPS, STATE_LABEL, type RoomState } from '@/lib/indicator';

export type BoardRoom = {
  id: number;
  number: string;
  type: string;
  state: RoomState;
  dot: boolean;
  reservationId: number | null;
  guest: string | null;
  bookingNo: string | null;
  stay: string | null;
  pax: number | null;
  channel: string | null;
  plan: string | null;
  unpaid: string | null;
  deposit: string | null;
  canCheckin: boolean;
  canDeposit: boolean;
  note: string | null;
  groupCode: string | null;
};

export type BoardFloor = { label: string; building?: string | null; rooms: BoardRoom[] };

type Pos = { left: number; top: number };

const TIP_W = 290;
const TIP_H = 230;

/** カーソルの右下に出し、画面の端では反対側に回り込ませる */
function place(x: number, y: number, w: number, h: number): Pos {
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
          {room.stay && <div className="sub">{room.stay}{room.pax ? ` ・ ${room.pax} 名` : ''}</div>}
          {(room.channel || room.bookingNo) && <div className="sub">{[room.channel, room.bookingNo].filter(Boolean).join(' ・ ')}{room.groupCode ? ` ・ グループ ${room.groupCode}` : ''}</div>}
          {room.plan && <div>{room.plan}</div>}
          {room.unpaid && <div style={{ fontWeight: 500, color: 'var(--warn-fg)' }}>未収：{room.unpaid}</div>}
          {room.deposit && <div style={{ fontWeight: 500, color: 'var(--info-fg)' }}>預り金：{room.deposit}</div>}
        </>
      )}
      {!room.guest && room.state === 'C' && <div className="sub">空室です。</div>}
      {!room.guest && room.state === 'X' && <div className="sub">故障・使用停止中です。客室マスタで解除できます。</div>}
      {room.note && <div className="memo">フロント備考：{room.note}</div>}
    </>
  );
}

export function IndicatorBoard({ floors }: { floors: BoardFloor[] }) {
  const [filters, setFilters] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [pin, setPin] = useState<{ id: number; left: number; top: number } | null>(null);

  const all = useMemo(() => floors.flatMap((f) => f.rooms), [floors]);
  const counts = useMemo(() => {
    const c: Record<RoomState, number> = { S: 0, N: 0, T: 0, A: 0, O: 0, C: 0, X: 0 };
    for (const r of all) c[r.state]++;
    return c;
  }, [all]);

  const active = new Set<RoomState>();
  for (const chip of CHIPS) if (filters[chip.key]) chip.match.forEach((m) => active.add(m));

  const hoverRoom = hover && hover.id !== pin?.id ? all.find((r) => r.id === hover.id) : undefined;
  const pinRoom = pin ? all.find((r) => r.id === pin.id) : undefined;
  const tipPos = hover && hoverRoom ? place(hover.x, hover.y, TIP_W, TIP_H) : null;

  const moveHover = (id: number, x: number, y: number) => {
    setHover((h) => (h && h.id === id && Math.abs(h.x - x) + Math.abs(h.y - y) < 4 ? h : { id, x, y }));
  };

  const togglePin = (room: BoardRoom, e: React.MouseEvent<HTMLButtonElement>) => {
    if (pin?.id === room.id) {
      setPin(null);
      return;
    }
    let x = e.clientX;
    let y = e.clientY;
    if (!x && !y) {
      const b = e.currentTarget.getBoundingClientRect();
      x = b.right - 8;
      y = b.bottom - 8;
    }
    const p = place(x, y, TIP_W, 300);
    setPin({ id: room.id, left: p.left + window.scrollX, top: p.top + window.scrollY });
    setHover(null);
  };

  return (
    <>
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
        <span className="sub row" style={{ gap: 6 }}><span className="rm-dot-legend" style={{ width: 8, height: 8, borderRadius: '50%', background: '#2a2f5a', display: 'inline-block' }} />フロント備考あり</span>
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
                const dim = active.size > 0 && !active.has(room.state);
                return (
                  <button
                    key={room.id}
                    type="button"
                    className={`rm st-${room.state}${dim ? ' dim' : ''}${pin?.id === room.id ? ' pinned' : ''}`}
                    aria-label={`${room.number}号室 ${room.type} ${STATE_LABEL[room.state]}${room.guest ? ` ${room.guest}様` : ''}${room.note ? ' 備考あり' : ''}`}
                    onMouseEnter={(e) => moveHover(room.id, e.clientX, e.clientY)}
                    onMouseMove={(e) => moveHover(room.id, e.clientX, e.clientY)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); moveHover(room.id, b.right - 8, b.bottom - 8); }}
                    onBlur={() => setHover(null)}
                    onClick={(e) => togglePin(room, e)}
                  >
                    {room.number}
                    {room.dot && <span className="dot" aria-hidden="true" />}
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
          <div className="hint">クリックで固定表示</div>
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
          {pinRoom.reservationId && (
            <div className="row" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
              {pinRoom.canCheckin && <Link className="btn small primary" href={`/reservations/${pinRoom.reservationId}?checkin=1`}>チェックイン精算</Link>}
              {pinRoom.canDeposit && <Link className="btn small" href={`/reservations/${pinRoom.reservationId}?deposit=1`}>預り金を登録</Link>}
              <Link className={`btn small${pinRoom.canCheckin ? '' : ' primary'}`} href={`/reservations/${pinRoom.reservationId}`}>予約詳細を開く</Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
