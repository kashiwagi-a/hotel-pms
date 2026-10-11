/**
 * チェックイン精算・預り金の共通ルール
 * - このホテルには後払いが無い。チェックイン時に未収分を精算し、必要なら預り金（前預かり）を受け取る
 * - クレジットカード・QR決済・電子マネーはブランドを必ず記録する
 * - 金額はすべて整数の円
 */
import { isCancelled } from './indicator';
import { requiresOnSitePayment } from './rakutsu-csv';

export const PAY_METHODS = [
  { id: 'cash', label: '現金' },
  { id: 'card', label: 'クレジットカード' },
  { id: 'qr', label: 'QR決済' },
  { id: 'emoney', label: '電子マネー' },
  { id: 'transfer', label: '銀行振込' },
] as const;

export type PayMethodId = (typeof PAY_METHODS)[number]['id'];

/** ブランドの選択が要らない支払方法 */
export const NO_BRAND: PayMethodId[] = ['cash', 'transfer'];

/** 銀行振込は前受金（到着前の入金）でだけ使う */
export const ADVANCE_ONLY: PayMethodId[] = ['transfer'];

/** 前受金を宿泊料等・預り金へ振り替えたときの支払方法。現金ではないのでレジの在高には入らない */
export const ADVANCE_METHOD = '前受金';

export const BRANDS: Record<Exclude<PayMethodId, 'cash' | 'transfer'>, { title: string; list: string[] }> = {
  card: { title: 'カードブランド', list: ['VISA', 'Mastercard', 'JCB', 'American Express', 'Diners Club', '銀聯（UnionPay）'] },
  qr: { title: 'QR決済の種類', list: ['PayPay', 'd払い', '楽天ペイ', 'au PAY', 'メルペイ', 'Alipay+', 'WeChat Pay'] },
  emoney: { title: '電子マネーの種類', list: ['交通系IC', 'iD', 'QUICPay', '楽天Edy', 'WAON', 'nanaco'] },
};

export const MAX_YEN = 10_000_000;

/**
 * 入金の区分
 * payment 入金 / deposit 預り金 / refund 預り金の返金
 * advance 前受金（到着前の入金）/ advance_refund 前受金の返金
 * 前受金はチェックイン時に、支払方法「前受金」の入金・預り金へ振り替える
 */
export type PaymentLike = { kind: string; source: string; amount: number; method?: string };

/** 前受金からの振替（お金は動いていない記録） */
export function isAdvanceTransfer(p: { kind: string; method?: string }): boolean {
  return p.method === ADVANCE_METHOD && (p.kind === 'payment' || p.kind === 'deposit');
}

export type MoneySummary = {
  /** 現地（フロント）で受け取る金額 */
  billed: number;
  /** この画面で受け取った宿泊料等 */
  paidHere: number;
  /** これから受け取る宿泊料等 */
  remaining: number;
  /** 預り金の残高（受入 − 返金） */
  depositBalance: number;
  /** 前受金の残高（受入 − 返金 − 振替） */
  advanceBalance: number;
  /** 予約サイトや法人で決済済み（現地での支払いなし） */
  prepaidOnline: boolean;
};

export function summarizeMoney(
  r: { settlement: string | null; billed: number },
  payments: PaymentLike[],
): MoneySummary {
  const sum = (pred: (p: PaymentLike) => boolean) => payments.filter(pred).reduce((s, p) => s + p.amount, 0);
  const prepaidOnline = !requiresOnSitePayment(r.settlement);
  const paidHere = sum((p) => p.kind === 'payment');
  const billed = prepaidOnline ? 0 : r.billed;
  const remaining = Math.max(0, billed - paidHere);
  const depositBalance = sum((p) => p.kind === 'deposit') - sum((p) => p.kind === 'refund');
  const advanceBalance = sum((p) => p.kind === 'advance') - sum((p) => p.kind === 'advance_refund') - sum(isAdvanceTransfer);
  return { billed, paidHere, remaining, depositBalance, advanceBalance, prepaidOnline };
}

/** チェックイン時の前受金の振り分け：まず宿泊料等に充当し、余りは預り金へ振り替える */
export function splitAdvance(advanceBalance: number, remaining: number): { applied: number; toDeposit: number } {
  const adv = Math.max(0, advanceBalance);
  const applied = Math.min(adv, Math.max(0, remaining));
  return { applied, toDeposit: adv - applied };
}

/** 画面に出す状態。らく通の区分（予約・変更・取消）に、この画面でのチェックイン・チェックアウトを重ねる */
export function effectiveStatus(r: { status: string; localCheckedInAt: Date | null; localCheckedOutAt?: Date | null }): string {
  if (r.localCheckedOutAt) return 'チェックアウト済';
  if (r.localCheckedInAt) return '滞在中';
  return r.status;
}

export function canCheckIn(
  r: {
    status: string; localCheckedInAt: Date | null; localCheckedOutAt?: Date | null;
    arrival: string | null; departure: string | null; roomCount?: number;
  },
  today: string,
  assignedRooms?: number,
): { ok: true } | { ok: false; reason: string } {
  if (isCancelled(r.status)) return { ok: false, reason: '取消になった予約です。' };
  if (r.localCheckedOutAt) return { ok: false, reason: 'すでにチェックアウト済みです。' };
  if (r.localCheckedInAt) return { ok: false, reason: 'すでにチェックイン済みです。' };
  if (!r.arrival || !r.departure) return { ok: false, reason: 'チェックイン日・チェックアウト日が分からない予約です。' };
  if (r.arrival > today) return { ok: false, reason: 'チェックイン日より前のためチェックインできません。' };
  if (r.departure <= today) return { ok: false, reason: 'チェックアウト日を過ぎているためチェックインできません。' };
  if (assignedRooms !== undefined && assignedRooms < (r.roomCount ?? 1)) {
    return { ok: false, reason: `部屋割りが済んでいません（${assignedRooms} / ${r.roomCount ?? 1} 室）。` };
  }
  return { ok: true };
}

/** チェックアウトできるか */
export function canCheckOut(r: { localCheckedInAt: Date | null; localCheckedOutAt?: Date | null }): { ok: true } | { ok: false; reason: string } {
  if (!r.localCheckedInAt) return { ok: false, reason: 'まだチェックインしていません。' };
  if (r.localCheckedOutAt) return { ok: false, reason: 'すでにチェックアウト済みです。' };
  return { ok: true };
}

/** フォームの金額を整数の円として読む（空欄は 0） */
export function parseYen(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? '').normalize('NFKC').replace(/[,円\s]/g, '');
  if (s === '') return 0;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= MAX_YEN ? n : null;
}

export function parsePaymentMethod(
  method: FormDataEntryValue | null,
  brand: FormDataEntryValue | null,
  opts: { allowTransfer?: boolean } = {},
): { ok: true; method: string; brand: string | null; isCash: boolean } | { ok: false; error: string } {
  const def = PAY_METHODS.find((m) => m.id === method && (opts.allowTransfer || !ADVANCE_ONLY.includes(m.id)));
  if (!def) return { ok: false, error: '支払方法を選択してください。' };
  if (def.id === 'cash') return { ok: true, method: def.label, brand: null, isCash: true };
  if (def.id === 'transfer') return { ok: true, method: def.label, brand: null, isCash: false };
  const b = String(brand ?? '');
  const brands = BRANDS[def.id];
  if (!brands.list.includes(b)) return { ok: false, error: `${brands.title}を選択してください。` };
  return { ok: true, method: def.label, brand: b, isCash: false };
}

/** ブランドを選んでいない（カード・QR・電子マネーで必須） */
export function needsBrand(method: PayMethodId, brand: string): boolean {
  return !NO_BRAND.includes(method) && !BRANDS[method as keyof typeof BRANDS].list.includes(brand);
}

export function formatMethod(method: string, brand: string | null): string {
  return brand ? `${method}（${brand}）` : method;
}
