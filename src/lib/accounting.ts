/** フロント会計の集計（1 日分） */
import { formatMethod, isAdvanceTransfer } from './settlement';

export type PaymentRow = { kind: string; method: string; brand: string | null; amount: number };

export type MethodSummary = { label: string; isCash: boolean; payment: number; deposit: number; advance: number; refund: number; count: number };

const isRefund = (kind: string) => kind === 'refund' || kind === 'advance_refund';

/** 支払方法別の集計。前受金からの振替はお金が動いていないので含めない */
export function summarizeByMethod(rows: PaymentRow[]): MethodSummary[] {
  const map = new Map<string, MethodSummary>();
  for (const p of rows) {
    if (isAdvanceTransfer(p)) continue;
    const label = formatMethod(p.method, p.brand);
    const s = map.get(label) ?? { label, isCash: p.method === '現金', payment: 0, deposit: 0, advance: 0, refund: 0, count: 0 };
    if (p.kind === 'payment') s.payment += p.amount;
    else if (p.kind === 'deposit') s.deposit += p.amount;
    else if (p.kind === 'advance') s.advance += p.amount;
    else if (isRefund(p.kind)) s.refund += p.amount;
    s.count++;
    map.set(label, s);
  }
  return [...map.values()].sort((a, b) => Number(b.isCash) - Number(a.isCash) || b.payment + b.deposit + b.advance - (a.payment + a.deposit + a.advance));
}

/** 理論在高＝釣銭準備金＋現金の入金・預り金・前受金−現金の返金 */
export function expectedCash(rows: PaymentRow[], floatAmount: number): number {
  return rows.filter((p) => p.method === '現金').reduce((s, p) => s + (isRefund(p.kind) ? -p.amount : p.amount), floatAmount);
}

/** レジ締めで数える金種（紙幣・硬貨） */
export const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1] as const;

export type DenominationCount = Partial<Record<(typeof DENOMINATIONS)[number], number>>;

/** 金種ごとの枚数から合計額を出す */
export function totalOfDenominations(counts: DenominationCount): number {
  return DENOMINATIONS.reduce((s, d) => s + d * (counts[d] ?? 0), 0);
}

/** 保存した金種の JSON を読む（壊れていれば null） */
export function parseDenominations(json: string | null | undefined): DenominationCount | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    const out: DenominationCount = {};
    for (const d of DENOMINATIONS) {
      const n = Number(v[d]);
      if (Number.isInteger(n) && n > 0) out[d] = n;
    }
    return out;
  } catch {
    return null;
  }
}

import { addDays, jstDayRange } from './dates';

/**
 * 営業日 [from, to) の入金を探す条件。
 * 営業日が記録されていない古い入金は、日本時間の時刻で代わりに判定する。
 */
export function paymentDateWhere(from: string, toExclusive: string) {
  return {
    OR: [
      { businessDate: { gte: from, lt: toExclusive } },
      { businessDate: null, createdAt: { gte: jstDayRange(from).start, lt: jstDayRange(addDays(toExclusive, -1)).end } },
    ],
  };
}
