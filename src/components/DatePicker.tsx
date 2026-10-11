'use client';

import { useEffect, useRef, useState } from 'react';
import { addDays, todayJst } from '@/lib/dates';
import { getCalendarCounts, type DayCount } from '@/app/_actions/calendar';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function label(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}（${DOW[d.getUTCDay()]}）`;
}

function monthOf(date: string) {
  return date.slice(0, 7);
}

function shiftMonth(month: string, n: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/**
 * 大きく押しやすい日付カレンダー。各日に到着件数と宿泊室数を表示する。
 * name を付けると hidden の input として送信され、autoSubmit なら選んだ時点でフォームを送信する。
 */
export function DatePicker({ name, value, today: todayProp, allowEmpty = false, autoSubmit = false, placeholder = '日付を選ぶ', ariaLabel = '日付', onChange }: {
  name?: string;
  /** 営業日（印を付け、「営業日」ボタンで選べる）。省略時は日本時間の今日 */
  today?: string;
  value: string;
  allowEmpty?: boolean;
  autoSubmit?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onChange?: (date: string) => void;
}) {
  const today = todayProp || todayJst();
  const [current, setCurrent] = useState(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(value || today));
  const [counts, setCounts] = useState<Record<string, Record<string, DayCount>>>({});
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setCurrent(value), [value]);

  // 表示中の月の件数を読み込む
  useEffect(() => {
    if (!open || counts[month]) return;
    let alive = true;
    getCalendarCounts(month).then((c) => { if (alive) setCounts((prev) => ({ ...prev, [month]: c })); });
    return () => { alive = false; };
  }, [open, month, counts]);

  // 外側のクリックと Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (date: string) => {
    setCurrent(date);
    setOpen(false);
    onChange?.(date);
    if (autoSubmit) requestAnimationFrame(() => input.current?.form?.requestSubmit());
  };

  // 6 週分のマス（日曜始まり）
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = addDays(`${month}-01`, -first.getUTCDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const monthCounts = counts[month];

  return (
    <div className="datepicker" ref={box}>
      {name && <input ref={input} type="hidden" name={name} value={current} />}
      <button type="button" className="dp-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={`${ariaLabel}：${current ? label(current) : '指定なし'}`} onClick={() => { setMonth(monthOf(current || today)); setOpen(!open); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <span>{current ? label(current) : placeholder}</span>
      </button>
      {open && (
        <div className="dp-pop" role="dialog" aria-label={`${ariaLabel}を選ぶ`}>
          <div className="dp-head">
            <button type="button" className="btn small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="前の月">前の月</button>
            <b>{Number(month.slice(0, 4))}年 {Number(month.slice(5, 7))}月</b>
            <button type="button" className="btn small" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="次の月">次の月</button>
          </div>
          <div className="dp-grid" role="grid">
            {DOW.map((d, i) => <div key={d} className={`dp-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{d}</div>)}
            {cells.map((d) => {
              const c = monthCounts?.[d];
              const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
              const cls = ['dp-day', monthOf(d) !== month && 'out', d === today && 'today', d === current && 'on', dow === 0 && 'sun', dow === 6 && 'sat'].filter(Boolean).join(' ');
              return (
                <button key={d} type="button" className={cls} onClick={() => pick(d)} aria-label={`${label(d)}${c ? ` 到着 ${c.arrivals} 件・宿泊 ${c.rooms} 室` : ''}`} aria-pressed={d === current}>
                  <span className="dp-num">{Number(d.slice(8))}</span>
                  {c && <span className="dp-count">{c.arrivals ? `着 ${c.arrivals}` : ''}{c.arrivals && c.rooms ? ' ・ ' : ''}{c.rooms ? `泊 ${c.rooms}` : ''}</span>}
                </button>
              );
            })}
          </div>
          <div className="dp-foot">
            <button type="button" className="btn small" onClick={() => pick(addDays(today, -1))}>営業日の前日</button>
            <button type="button" className="btn small primary" onClick={() => pick(today)}>営業日</button>
            <button type="button" className="btn small" onClick={() => pick(addDays(today, 1))}>営業日の翌日</button>
            {allowEmpty && <button type="button" className="btn small" onClick={() => pick('')}>指定なし</button>}
            <span className="sub" style={{ marginLeft: 'auto', fontSize: 12 }}>枠＝営業日　着＝到着件数　泊＝宿泊室数</span>
          </div>
        </div>
      )}
    </div>
  );
}
