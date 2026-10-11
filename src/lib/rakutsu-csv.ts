/**
 * らく通「宿泊者一覧」CSV の読み込み
 *
 * - 列は見出し名で探すので、列の並び順が変わっても読める
 * - 文字コードは UTF-8（BOM あり・なし）と Shift_JIS に対応
 * - 金額は整数の円、日付は YYYY-MM-DD、日時は日本時間として読む
 */

export const RAKUTSU_COLUMNS = {
  bookingNo: '予約番号',
  roomNumber: '部屋番号',
  roomType: '部屋タイプ',
  arrival: '到着日',
  departure: '出発日',
  nights: '泊数',
  guestName: '宿泊者名',
  phone: '電話番号',
  pax: '人数',
  groupCode: 'グループ',
  status: 'ステータス',
  checkedInAt: 'チェックイン時間',
  channel: '販売経路',
  mealPlan: '食事条件',
  settlement: '決済方法',
  pricePerNight: '泊ごとの料金',
  couponPoints: 'クーポン・ポイント',
  totalAmount: '合計金額(税込・割引後)',
  extraFee: '追加費用',
  extraDetail: '追加費用の内訳',
  billed: 'ご請求',
  received: '受領済み',
  unpaid: '未収',
  receiptsRaw: '受領の内訳',
  planName: 'その他備考',
  frontNote: 'フロント備考',
  sourceCreatedAt: '登録日時',
  sourceCreatedBy: '登録者',
  sourceUpdatedAt: '最終更新日時',
  sourceUpdatedBy: '最終更新者',
} as const;

export type RakutsuField = keyof typeof RAKUTSU_COLUMNS;

const REQUIRED: RakutsuField[] = ['roomNumber', 'guestName', 'arrival', 'departure', 'status'];

export type ReceiptEntry = {
  amount: number;
  method: string;
  brand: string | null;
  register: string | null;
  raw: string;
};

export type RakutsuRecord = {
  /** CSV 上の行番号（見出しを 1 行目とする） */
  line: number;
  bookingNo: string | null;
  roomNumber: string | null;
  roomType: string | null;
  arrival: string | null;
  departure: string | null;
  nights: number | null;
  guestName: string | null;
  phone: string | null;
  pax: number | null;
  groupCode: string | null;
  status: string | null;
  checkedInAt: Date | null;
  channel: string | null;
  mealPlan: string | null;
  settlement: string | null;
  pricePerNight: number | null;
  couponPoints: number | null;
  totalAmount: number | null;
  extraFee: number | null;
  extraDetail: string | null;
  billed: number | null;
  received: number | null;
  unpaid: number | null;
  receiptsRaw: string | null;
  receipts: ReceiptEntry[];
  planName: string | null;
  frontNote: string | null;
  sourceCreatedAt: Date | null;
  sourceCreatedBy: string | null;
  sourceUpdatedAt: Date | null;
  sourceUpdatedBy: string | null;
  /** 途中で切れている（… を含む）項目の見出し名 */
  truncatedFields: string[];
};

export class RakutsuCsvError extends Error {}

/** バイト列を文字列にする（UTF-8 で読めなければ Shift_JIS として読む） */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** RFC 4180 形式の CSV を 2 次元配列にする（"" で囲まれた改行・カンマに対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function normalizeHeader(value: string): string {
  return value.replace(/^﻿/, '').normalize('NFKC').replace(/\s+/g, '');
}

export function toInt(value: string | null): number | null {
  if (value == null) return null;
  const s = value.normalize('NFKC').replace(/[,円\s]/g, '');
  if (!/^-?\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

export function toIsoDate(value: string | null): string | null {
  if (value == null) return null;
  const m = value.normalize('NFKC').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function toJstDateTime(value: string | null): Date | null {
  if (value == null) return null;
  const m = value.normalize('NFKC').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const p = (s: string) => s.padStart(2, '0');
  const d = new Date(`${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${m[5]}:${m[6] ?? '00'}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const BRAND_WORDS = [
  'VISA', 'MASTER', 'JCB', 'AMEX', 'AMERICAN', 'DINERS', 'DISCOVER', '銀聯', 'UNIONPAY',
  'PAYPAY', 'D払い', '楽天ペイ', 'AU PAY', 'AUPAY', 'メルペイ', 'ALIPAY', 'WECHAT', 'LINE PAY',
  '交通系', 'SUICA', 'PASMO', 'ICOCA', 'ID', 'QUICPAY', 'EDY', 'WAON', 'NANACO',
];

function looksLikeBrand(value: string): boolean {
  const t = value.normalize('NFKC').toUpperCase();
  if (t.includes('フロント')) return false;
  return BRAND_WORDS.some((w) => t.includes(w.toUpperCase()));
}

/**
 * 受領の内訳を読む
 * 例：「22,200円 クレジットカード(VISA)(古河駅前 フロント 10/10 16:19)」
 *     → 22200 / クレジットカード / VISA / 古河駅前 フロント 10/10 16:19
 */
export function parseReceipts(raw: string | null): ReceiptEntry[] {
  if (!raw) return [];
  const re = /(-?[\d,]+)\s*円\s*([^\s(（,、]+)\s*(?:[(（]([^)）]*)(?:[)）]|$))?\s*(?:[(（]([^)）]*)(?:[)）]|$))?/g;
  const entries: ReceiptEntry[] = [];
  for (const m of raw.matchAll(re)) {
    const amount = toInt(m[1]);
    if (amount == null) continue;
    const first = m[3]?.trim() || null;
    const second = m[4]?.trim() || null;
    let brand: string | null = null;
    let register: string | null = null;
    if (first && looksLikeBrand(first)) {
      brand = first;
      register = second;
    } else {
      register = first;
    }
    entries.push({ amount, method: m[2], brand, register, raw: m[0].trim() });
  }
  return entries;
}

export type ParsedRakutsuCsv = {
  records: RakutsuRecord[];
  /** らく通の列として認識できなかった見出し */
  unknownColumns: string[];
};

export function parseRakutsuCsv(text: string): ParsedRakutsuCsv {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new RakutsuCsvError('CSV が空です。');

  const header = rows[0].map(normalizeHeader);
  const index: Partial<Record<RakutsuField, number>> = {};
  for (const [field, name] of Object.entries(RAKUTSU_COLUMNS) as [RakutsuField, string][]) {
    const i = header.indexOf(normalizeHeader(name));
    if (i >= 0) index[field] = i;
  }
  const missing = REQUIRED.filter((f) => index[f] === undefined).map((f) => RAKUTSU_COLUMNS[f]);
  if (missing.length > 0) {
    throw new RakutsuCsvError(`らく通の「宿泊者一覧」の形式ではありません。必要な列がありません：${missing.join('、')}`);
  }
  const known = new Set(Object.values(RAKUTSU_COLUMNS).map(normalizeHeader));
  const unknownColumns = rows[0].filter((h) => h.trim() && !known.has(normalizeHeader(h)));

  const records = rows.slice(1).map((cells, k) => {
    const truncatedFields: string[] = [];
    const get = (field: RakutsuField): string | null => {
      const i = index[field];
      if (i === undefined) return null;
      const v = (cells[i] ?? '').trim();
      if (v === '') return null;
      if (v.includes('…')) truncatedFields.push(RAKUTSU_COLUMNS[field]);
      return v;
    };
    const receiptsRaw = get('receiptsRaw');
    const record: RakutsuRecord = {
      line: k + 2,
      bookingNo: get('bookingNo'),
      roomNumber: get('roomNumber')?.normalize('NFKC') ?? null,
      roomType: get('roomType'),
      arrival: toIsoDate(get('arrival')),
      departure: toIsoDate(get('departure')),
      nights: toInt(get('nights')),
      guestName: get('guestName'),
      phone: get('phone'),
      pax: toInt(get('pax')),
      groupCode: get('groupCode'),
      status: get('status'),
      checkedInAt: toJstDateTime(get('checkedInAt')),
      channel: get('channel'),
      mealPlan: get('mealPlan'),
      settlement: get('settlement'),
      pricePerNight: toInt(get('pricePerNight')),
      couponPoints: toInt(get('couponPoints')),
      totalAmount: toInt(get('totalAmount')),
      extraFee: toInt(get('extraFee')),
      extraDetail: get('extraDetail'),
      billed: toInt(get('billed')),
      received: toInt(get('received')),
      unpaid: toInt(get('unpaid')),
      receiptsRaw,
      receipts: parseReceipts(receiptsRaw),
      planName: get('planName'),
      frontNote: get('frontNote'),
      sourceCreatedAt: toJstDateTime(get('sourceCreatedAt')),
      sourceCreatedBy: get('sourceCreatedBy'),
      sourceUpdatedAt: toJstDateTime(get('sourceUpdatedAt')),
      sourceUpdatedBy: get('sourceUpdatedBy'),
      truncatedFields,
    };
    return record;
  });
  return { records, unknownColumns };
}
