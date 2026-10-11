'use client';

import { useActionState, useState } from 'react';
import { DatePicker } from '@/components/DatePicker';
import { resetDataAction, setBusinessDateAction, type DayResult } from '@/app/_actions/business-day';

/** 営業日の修正（ナイトオーディットを押し間違えたときなど） */
export function BusinessDateForm({ businessDate }: { businessDate: string }) {
  const [state, action, pending] = useActionState<DayResult, FormData>(setBusinessDateAction, null);
  const [date, setDate] = useState(businessDate);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="date" value={date} />
      <div className="row">
        <DatePicker value={date} today={businessDate} onChange={setDate} ariaLabel="営業日" />
        <button className="btn" type="submit" disabled={pending || date === businessDate}>営業日を変更</button>
      </div>
      <div className="sub">ふだんはダッシュボードのナイトオーディットで進めます。押し間違えたときだけ、ここで直してください。</div>
      {state && <div className={`notice ${state.ok ? 'ok' : 'error'}`} role="status">{state.ok ? state.message : state.error}</div>}
    </form>
  );
}

/** 取り込んだデータのリセット（客室マスタは残す） */
export function ResetDataForm({ businessDate }: { businessDate: string }) {
  const [state, action, pending] = useActionState<DayResult, FormData>(resetDataAction, null);
  const [date, setDate] = useState(businessDate);
  const [confirm, setConfirm] = useState('');
  if (state?.ok) return <div className="notice ok" role="status">{state.message}</div>;
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="date" value={date} />
      <div className="sub">予約・部屋割り・入金・預り金・取り込み履歴・レジ締め・ナイトオーディットの記録をすべて削除します。施設名と客室マスタ（部屋タイプ名・故障の設定）は残ります。元に戻せません。</div>
      <div className="row">
        <span className="sub">リセット後の営業日</span>
        <DatePicker value={date} today={businessDate} onChange={setDate} ariaLabel="リセット後の営業日" />
      </div>
      <label className="field">確認のため「リセット」と入力してください
        <input className="input" name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </label>
      {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
      <div><button className="btn danger" type="submit" disabled={pending || confirm.trim() !== 'リセット'}>{pending ? '削除中…' : 'データをリセット'}</button></div>
    </form>
  );
}
