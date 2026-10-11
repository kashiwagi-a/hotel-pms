'use client';

import { useActionState, useState } from 'react';
import { yen } from '@/lib/format';
import { DENOMINATIONS, totalOfDenominations, type DenominationCount } from '@/lib/accounting';
import { closeRegisterAction, type CloseResult } from './actions';

type Denom = (typeof DENOMINATIONS)[number];

const BILLS: Denom[] = [10000, 5000, 2000, 1000];

/** 金種ごとに枚数を数えて合計を出す。入力は＋−ボタンでも打てる */
export function DenominationCounter({ counts, onChange }: { counts: DenominationCount; onChange: (c: DenominationCount) => void }) {
  const set = (d: Denom, n: number) => onChange({ ...counts, [d]: Math.max(0, Math.min(99_999, n)) });
  const billTotal = BILLS.reduce((s, d) => s + d * (counts[d] ?? 0), 0);
  const total = totalOfDenominations(counts);
  return (
    <table className="denoms" aria-label="金種別の枚数">
      <colgroup><col className="c-face" /><col className="c-cnt" /><col /></colgroup>
      <thead><tr><th>金種</th><th className="num">枚数</th><th className="num">金額</th></tr></thead>
      <tbody>
        {DENOMINATIONS.map((d) => {
          const n = counts[d] ?? 0;
          return (
            <tr key={d} className={d === 500 ? 'sep' : undefined}>
              <td className="face">{yen(d)}<small>{BILLS.includes(d) ? '札' : '玉'}</small></td>
              <td>
                <div className="cnt">
                  <button type="button" className="btn small" aria-label={`${yen(d)} を 1 枚減らす`} onClick={() => set(d, n - 1)} disabled={n === 0}>−</button>
                  <input
                    className="input"
                    inputMode="numeric"
                    aria-label={`${yen(d)} の枚数`}
                    value={n || ''}
                    placeholder="0"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => set(d, Number(e.target.value.normalize('NFKC').replace(/[^\d]/g, '')) || 0)}
                  />
                  <button type="button" className="btn small" aria-label={`${yen(d)} を 1 枚増やす`} onClick={() => set(d, n + 1)}>＋</button>
                </div>
              </td>
              <td className="num">{yen(d * n)}</td>
            </tr>
          );
        })}
        <tr className="sum"><td colSpan={2}>紙幣 {yen(billTotal)} ・ 硬貨 {yen(total - billTotal)}</td><td className="num">{yen(total)}</td></tr>
      </tbody>
    </table>
  );
}

/** レジ締めの入力。過不足はその場で計算し、確定時にサーバーで計算し直す */
export function RegisterCloseForm({ date, cashMovement, defaultFloat }: { date: string; cashMovement: number; defaultFloat: number }) {
  const [state, action, pending] = useActionState<CloseResult, FormData>(closeRegisterAction, null);
  const [floatAmount, setFloat] = useState(String(defaultFloat));
  const [byDenom, setByDenom] = useState(true);
  const [counts, setCounts] = useState<DenominationCount>({});
  const [manual, setManual] = useState('');
  const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
  const expected = num(floatAmount) + cashMovement;
  const touched = Object.values(counts).some((n) => (n ?? 0) > 0);
  const counted = byDenom ? (touched ? String(totalOfDenominations(counts)) : '') : manual;
  const diff = counted === '' ? null : num(counted) - expected;
  if (state?.ok) return <div className="notice ok" role="status">{state.message}</div>;
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="date" value={date} />
      <label className="field">釣銭準備金<input className="input big" name="floatAmount" inputMode="numeric" value={floatAmount} onChange={(e) => setFloat(e.target.value)} /></label>
      <div className="money">
        <div><span>現金の動き（入金＋預り金＋前受金−返金）</span><span>{yen(cashMovement)}</span></div>
        <div className="strong"><span>理論在高</span><span>{yen(expected)}</span></div>
      </div>

      <div className="pills cols-2" role="group" aria-label="数え方">
        <button type="button" className={`pill small${byDenom ? ' on' : ''}`} aria-pressed={byDenom} onClick={() => setByDenom(true)}>金種で数える</button>
        <button type="button" className={`pill small${!byDenom ? ' on' : ''}`} aria-pressed={!byDenom} onClick={() => setByDenom(false)}>合計額を入力</button>
      </div>
      {byDenom ? (
        <>
          <DenominationCounter counts={counts} onChange={setCounts} />
          <input type="hidden" name="countedCash" value={counted} />
          <input type="hidden" name="denominations" value={touched ? JSON.stringify(counts) : ''} />
          {touched && <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setCounts({})}>枚数をすべて消す</button>}
        </>
      ) : (
        <label className="field">数えた現金（実査）<input className="input big" name="countedCash" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={String(expected)} /></label>
      )}

      {diff !== null && (
        <div className="money">
          <div><span>実査</span><span>{yen(num(counted))}</span></div>
          <div className="total" style={{ color: diff === 0 ? 'var(--ok-fg)' : 'var(--danger)' }}><span>過不足</span><span>{diff === 0 ? 'なし（一致）' : `${diff > 0 ? '+' : ''}${yen(diff)}`}</span></div>
        </div>
      )}
      <label className="field">メモ（任意）<input className="input" name="note" maxLength={200} placeholder="過不足の理由など" /></label>
      {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
      <button className="btn primary big" type="submit" disabled={pending || counted === ''}>{pending ? '登録中…' : 'レジ締めを確定'}</button>
    </form>
  );
}
