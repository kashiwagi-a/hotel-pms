/**
 * チェックイン精算・預り金の共通ルール
 * - このホテルには後払いが無い。チェックイン時に未収分を精算し、必要なら預り金（前預かり）を受け取る
 * - クレジットカード・QR決済・電子マネーはブランドを必ず記録する
 * - 金額はすべて整数の円
 */
import { isCancelled } from './indicator';

export const PAY_METHODS = [
  { id: 'cash', label: '現金' },
  { id: 'card', label: 'クレジットカード' },
  { id: 'qr', label: 'QR決済' },
  { id: 'emoney', label: '電子マネー' },
] as const;

export type PayMethodId = (typeof PAY_METHODS)[number]['id'];

export const BRANDS: Record<Exclude<PayMethodId, 'cash'>, { title: string; list: string[] }> = {
  card: { title: 'カードブランド', list: ['VISA', 'Mastercard', 'JCB', 'American Express', 'Diners Club', '銀聯（UnionPay）'] },
  qr: { title: 'QR決済の種類', list: ['PayPay', 'd払い', '楽天ペイ', 'au PAY', 'メルペイ', 'Alipay+', 'WeChat Pay'] },
  emoney: { title: '電子マネーの種類', list: ['交通系IC', 'iD', 'QUICPay', '楽天Edy', 'WAON', 'nanaco'] },
};

export const MAX_YEN = 10_000_000;

export type PaymentLike = { kind: string; source: string; amount: number };

export type MoneySummary = {
  /** らく通の「ご請求」（現地で受け取る金額） */
  billed: number;
  /** らく通で受領済みの金額 */
  receivedImport: number;
  /** この画面で受け取った宿泊料等 */
  paidHere: number;
  /** これから受け取る宿泊料等 */
  remaining: number;
  /** 預り金の残高（受入 − 返金） */
  depositBalance: number;
  /** 予約サイトで決済済み（精算不要） */
  prepaidOnline: boolean;
};

export function summarizeMoney(
  r: { settlement: string | null; billed: number; received: number },
  payments: PaymentLike[],
): MoneySummary {
  const sum = (pred: (p: PaymentLike) => boolean) => payments.filter(pred).reduce((s, p) => s + p.amount, 0);
  const prepaidOnline = r.settlement === '精算不要';
  const paidHere = sum((p) => p.kind === 'payment' && p.source === 'manual');
  const billed = prepaidOnline ? 0 : r.billed;
  const remaining = Math.max(0, billed - r.received - paidHere);
  const depositBalance = sum((p) => p.kind === 'deposit') - sum((p) => p.kind === 'refund');
  return { billed, receivedImport: r.received, paidHere, remaining, depositBalance, prepaidOnline };
}

/** 画面上で「滞在中」として扱うステータス（この画面でチェックインした予約を含む） */
export function effectiveStatus(r: { status: string; localCheckedInAt: Date | null }): string {
  if (r.localCheckedInAt && !/滞在中|アウト|チェックアウト/.test(r.status) && !isCancelled(r.status)) return '滞在中';
  return r.status;
}

export function canCheckIn(
  r: { status: string; localCheckedInAt: Date | null; arrival: string | null; departure: string | null },
  today: string,
): { ok: true } | { ok: false; reason: string } {
  if (isCancelled(r.status)) return { ok: false, reason: 'キャンセルされた予約です。' };
  if (r.localCheckedInAt || /滞在中|チェックイン/.test(r.status)) return { ok: false, reason: 'すでにチェックイン済みです。' };
  if (/アウト|チェックアウト/.test(r.status)) return { ok: false, reason: 'すでにチェックアウト済みです。' };
  if (!r.arrival || !r.departure) return { ok: false, reason: '到着日・出発日が分からない予約です。' };
  if (r.arrival > today) return { ok: false, reason: '到着日より前のためチェックインできません。' };
  if (r.departure <= today) return { ok: false, reason: '出発日を過ぎているためチェックインできません。' };
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
): { ok: true; method: string; brand: string | null; isCash: boolean } | { ok: false; error: string } {
  const def = PAY_METHODS.find((m) => m.id === method);
  if (!def) return { ok: false, error: '支払方法を選択してください。' };
  if (def.id === 'cash') return { ok: true, method: def.label, brand: null, isCash: true };
  const b = String(brand ?? '');
  const brands = BRANDS[def.id];
  if (!brands.list.includes(b)) return { ok: false, error: `${brands.title}を選択してください。` };
  return { ok: true, method: def.label, brand: b, isCash: false };
}

export function formatMethod(method: string, brand: string | null): string {
  return brand ? `${method}（${brand}）` : method;
}
