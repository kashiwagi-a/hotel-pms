'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { formatDateJa } from '@/lib/format';
import { advanceBusinessDayAction, type DayResult } from '@/app/_actions/business-day';

export type AuditCheck = { label: string; count: number; href?: string; okText: string; ngText: string };

/** ナイトオーディット：確認事項を見てから、営業日を翌日へ進める */
export function NightAudit({ businessDate, nextDate, checks, registerClosed }: {
  businessDate: string;
  nextDate: string;
  checks: AuditCheck[];
  registerClosed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DayResult, FormData>(advanceBusinessDayAction, null);
  const issues = checks.filter((c) => c.count > 0).length + (registerClosed ? 0 : 1);
  const close = () => {
    setOpen(false);
    router.refresh();
  };
  return (
    <div className="card card-pad audit row" id="night-audit" style={{ justifyContent: 'space-between' }}>
      <div>
        <div className="sub">営業日</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{formatDateJa(businessDate, true)}</div>
        <div className="sub">一日の業務が終わったら、ナイトオーディットで営業日を翌日へ進めます。</div>
      </div>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>営業日を締めて翌日へ（ナイトオーディット）</button>
      {open && (
        <Modal title="ナイトオーディット" subtitle={<div style={{ fontSize: 18, fontWeight: 700 }}>{formatDateJa(businessDate, true)} を締めて {formatDateJa(nextDate, true)} へ進めます</div>} onClose={close} width={620}>
          {state?.ok ? (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }} role="status">
              <div style={{ fontSize: 18, fontWeight: 700 }}>営業日を進めました</div>
              <div>{state.message}</div>
              <button type="button" className="btn primary" onClick={close}>閉じる</button>
            </div>
          ) : (
            <form action={action} className="stack">
              <input type="hidden" name="expected" value={businessDate} />
              <ul className="checklist">
                {checks.map((c) => (
                  <li key={c.label}>
                    <span className={`mark ${c.count ? 'ng' : 'ok'}`}>{c.count ? '要確認' : 'OK'}</span>
                    <span>{c.count ? c.ngText.replace('{n}', String(c.count)) : c.okText}{c.count > 0 && c.href && <> <Link href={c.href} onClick={() => setOpen(false)}>確認する</Link></>}</span>
                  </li>
                ))}
                <li>
                  <span className={`mark ${registerClosed ? 'ok' : 'ng'}`}>{registerClosed ? 'OK' : '要確認'}</span>
                  <span>{registerClosed ? 'レジ締めは済んでいます。' : 'レジ締めがまだです。'}{!registerClosed && <> <Link href={`/accounting?date=${businessDate}`} onClick={() => setOpen(false)}>フロント会計へ</Link></>}</span>
                </li>
              </ul>
              {issues > 0 && <div className="notice warn">確認が必要な項目が {issues} 件あります。このまま進めることもできます。</div>}
              <label className="field">メモ（任意）<input className="input" name="note" maxLength={200} placeholder="引き継ぎ事項など" /></label>
              {state && !state.ok && <div className="notice error" role="alert">{state.error}</div>}
              <button type="submit" className="btn primary big" disabled={pending}>{pending ? '処理中…' : `${formatDateJa(nextDate, true)} へ進める`}</button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
