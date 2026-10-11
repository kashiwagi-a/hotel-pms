'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { importAction, type ImportState } from './actions';

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, null);
  return (
    <div className="stack">
      <form action={action} className="card card-pad stack">
        <label className="field">らく通「予約一覧」の CSV ファイル
          <input className="input" type="file" name="file" accept=".csv,text/csv" required style={{ paddingTop: 8 }} />
        </label>
        <label className="row" style={{ fontSize: 13 }}>
          <input type="checkbox" name="dryRun" defaultChecked />
          確認のみ（データベースを変更せず、件数と注意点だけを表示する）
        </label>
        <div className="row">
          <button className="btn primary" type="submit" disabled={pending}>{pending ? '処理中…' : '取り込む'}</button>
          <span className="sub">同じ予約は予約番号で判定して上書きします。何度取り込んでも重複しません。</span>
        </div>
      </form>

      {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}

      {state && state.ok && (
        <div className="card card-pad stack" role="status">
          <div className={`notice ${state.summary.warnings.length ? 'warn' : 'ok'}`}>
            {state.summary.dryRun ? '【確認のみ・まだ取り込んでいません】' : '取り込みました。'}
            {state.summary.fileName}：{state.summary.total} 行 ・ 新規 {state.summary.created} 件 ・ 更新 {state.summary.updated} 件 ・ 取消のため除外 {state.summary.cancelled} 件 ・ 取り込めなかった行 {state.summary.skipped} 件
          </div>
          {state.summary.cancelRemoved > 0 && (
            <div className="sub">取消になった予約 {state.summary.cancelRemoved} 件を{state.summary.dryRun ? '削除します（部屋割りも外れます）' : '削除しました（部屋割りも外しました）'}。</div>
          )}
          {state.summary.unknownColumns.length > 0 && (
            <div className="sub">読み込まなかった列：{state.summary.unknownColumns.join('、')}</div>
          )}
          {state.summary.warnings.length > 0 && (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th className="num">行</th><th>注意点</th></tr></thead>
                <tbody>
                  {state.summary.warnings.map((w, i) => (
                    <tr key={i}><td className="num">{w.line || '—'}</td><td>{w.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {state.summary.dryRun ? (
            <div className="sub">内容に問題がなければ「確認のみ」のチェックを外して、もう一度取り込んでください。</div>
          ) : (
            <div className="row">
              <Link className="btn primary" href="/indicator">インジケーターで部屋割り</Link>
              <Link className="btn" href="/reservations">予約一覧を見る</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
