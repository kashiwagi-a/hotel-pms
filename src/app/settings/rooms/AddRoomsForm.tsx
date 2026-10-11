'use client';

import { useActionState } from 'react';
import { addRoomsAction, type RoomsState } from './actions';

export function AddRoomsForm() {
  const [state, action, pending] = useActionState<RoomsState, FormData>(addRoomsAction, null);
  return (
    <form action={action} className="stack">
      <label className="field">1 行に 1 つずつ「部屋番号 部屋タイプ」または「開始-終了 部屋タイプ」で入力します
        <textarea className="input" name="rooms" placeholder={'201-216 禁煙シングル\n301-312 加熱式シングル\n501 ツイン'} />
      </label>
      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? '登録中…' : '登録する'}</button>
        <span className="sub">階は部屋番号から自動で決まります（201 → 2F）。登録済みの部屋は部屋タイプだけを更新します。</span>
      </div>
      {state && <div className={`notice ${state.ok ? 'ok' : 'error'}`} role="status">{state.message}</div>}
    </form>
  );
}
