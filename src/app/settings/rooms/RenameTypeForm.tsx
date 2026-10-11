'use client';

import { useState } from 'react';
import { renameRoomTypeAction } from './actions';

const CUSTOM = '__custom__';

/** 部屋タイプ名をまとめて変更する。新しい名前は、らく通の CSV にある部屋タイプから選ぶか、直接入力する */
export function RenameTypeForm({ types, rakutsuTypes }: {
  types: { name: string; codes: string[]; count: number }[];
  rakutsuTypes: string[];
}) {
  const [from, setFrom] = useState('');
  const [choice, setChoice] = useState(rakutsuTypes.length ? '' : CUSTOM);
  const [custom, setCustom] = useState('');
  const used = new Set(types.map((t) => t.name));
  const to = choice === CUSTOM ? custom.trim() : choice;
  const target = types.find((t) => t.name === from);

  return (
    <form
      action={async (fd) => {
        await renameRoomTypeAction(fd);
        setFrom('');
        setChoice(rakutsuTypes.length ? '' : CUSTOM);
        setCustom('');
      }}
      className="stack"
    >
      <input type="hidden" name="to" value={to} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 220px' }}>今の名前
          <select className="input" name="from" required value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="" disabled>選択してください</option>
            {types.map((t) => (
              <option key={t.name} value={t.name}>{t.name}{t.codes.length ? `（${t.codes.join('・')}）` : ''} ・ {t.count} 室</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>新しい名前
          <select className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="" disabled>{rakutsuTypes.length ? 'らく通の部屋タイプから選ぶ' : '選択してください'}</option>
            {rakutsuTypes.length > 0 && (
              <optgroup label="らく通の部屋タイプ">
                {rakutsuTypes.map((t) => <option key={t} value={t}>{t}{used.has(t) ? '（客室マスタで使用中）' : ''}</option>)}
              </optgroup>
            )}
            <option value={CUSTOM}>直接入力する</option>
          </select>
        </label>
        {choice === CUSTOM && (
          <label className="field" style={{ flex: '1 1 200px' }}>名前を入力
            <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={50} placeholder="例：ファミリールーム" required />
          </label>
        )}
        <button className="btn primary" type="submit" disabled={!from || !to || from === to}>変更</button>
      </div>
      {target && to && from !== to && (
        <div className="sub">「{from}」の {target.count} 室を「{to}」に変更します。{used.has(to) ? '同じ名前の部屋タイプとまとめて表示されるようになります。' : ''}</div>
      )}
      {rakutsuTypes.length === 0 && (
        <div className="sub">らく通の CSV を取り込むと、CSV にある部屋タイプをここから選べるようになります。</div>
      )}
    </form>
  );
}
