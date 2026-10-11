'use client';

import { ADVANCE_ONLY, BRANDS, NO_BRAND, PAY_METHODS, type PayMethodId } from '@/lib/settlement';

/** 支払方法と、カード・QR・電子マネーのブランドを選ぶ。選んだ値は hidden の method・brand で送る */
export function PaymentMethodPicker({ method, brand, onMethod, onBrand, allowTransfer = false }: {
  method: PayMethodId;
  brand: string;
  onMethod: (m: PayMethodId) => void;
  onBrand: (b: string) => void;
  /** 銀行振込を選べるようにする（前受金の登録用） */
  allowTransfer?: boolean;
}) {
  const brands = NO_BRAND.includes(method) ? null : BRANDS[method as keyof typeof BRANDS];
  const methods = PAY_METHODS.filter((m) => allowTransfer || !ADVANCE_ONLY.includes(m.id));
  return (
    <div className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="brand" value={brand} />
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">支払方法</span>
        <div className="pills cols-2" role="group" aria-label="支払方法">
          {methods.map((m) => (
            <button key={m.id} type="button" className={`pill${method === m.id ? ' on' : ''}`} aria-pressed={method === m.id} onClick={() => { onMethod(m.id); onBrand(''); }}>{m.label}</button>
          ))}
        </div>
      </div>
      {brands && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{brands.title}</span>
          <div className="pills auto" role="group" aria-label={brands.title}>
            {brands.list.map((b) => (
              <button key={b} type="button" className={`pill small${brand === b ? ' on' : ''}`} aria-pressed={brand === b} onClick={() => onBrand(b)}>{b}</button>
            ))}
          </div>
          {!brand && <span className="field-error">{brands.title}を選択してください</span>}
        </div>
      )}
    </div>
  );
}
