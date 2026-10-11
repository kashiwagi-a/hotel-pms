/**
 * らく通「予約一覧」CSV の読み込み
 *
 * - 1 行 = 1 予約。部屋番号は含まれないので、部屋は取り込み後にインジケーターで割り当てる
 * - 列は見出し名で探すので、列の並び順が変わっても読める（見出しの後ろの「（…）」の注記は無視する）
 * - 文字コードは UTF-8（BOM あり・なし）と Shift_JIS に対応
 * - 金額は整数の円、日付は YYYY-MM-DD、日時は日本時間として読む
 */

export const RAKUTSU_COLUMNS = {
  confirmMark: '確認',
  printMark: '印刷',
  linkMark: '連動',
  status: '区分',
  bookingNo: '予約番号',
  arrival: 'チェックイン',
  departure: 'チェックアウト',
  nights: '泊数',
  pax: '人数',
  roomCount: '室数',
  roomTypeRaw: '室タイプ',
  planName: 'プラン',
  channel: 'エージェント',
  guestName: 'お客様名',
  phone: '電話番号',
  settlement: '決済方法',
  couponPoints: 'ポイント額',
  totalAmount: 'ポイント割引後額',
  memo: '予約メモ',
  bookedAt: '受信日／登録日',
} as const;

export type RakutsuField = keyof typeof RAKUTSU_COLUMNS;

const REQUIRED: RakutsuField[] = ['status', 'arrival', 'departure', 'roomTypeRaw', 'guestName'];

export type RakutsuRecord = {
  /** CSV 上の行番号（見出しを 1 行目とする） */
  line: number;
  confirmMark: string | null;
  printMark: string | null;
  linkMark: string | null;
  status: string | null;
  bookingNo: string | null;
  arrival: string | null;
  departure: string | null;
  nights: number | null;
  pax: number | null;
  roomCount: number | null;
  roomTypeRaw: string | null;
  roomTypeCode: string | null;
  roomType: string | null;
  planName: string | null;
  channel: string | null;
  guestName: string | null;
  phone: string | null;
  /** 電話番号が Excel の指数表記（8.02E+09 など）で壊れていた */
  phoneBroken: boolean;
  settlement: string | null;
  couponPoints: number | null;
  totalAmount: number | null;
  memo: string | null;
  bookedAt: Date | null;
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

/** 見出しを比べやすい形にする（全角半角をそろえ、空白と末尾の「（…）」注記を取る） */
function normalizeHeader(value: string): string {
  return value.replace(/^﻿/, '').normalize('NFKC').replace(/\s+/g, '').replace(/\(.*\)$/, '');
}

export function toInt(value: string | null): number | null {
  if (value == null) return null;
  const s = value.normalize('NFKC').replace(/[,円\s]/g, '');
  if (!/^-?\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

/** 20261011・2026/10/11・2026-10-11 → 2026-10-11 */
export function toIsoDate(value: string | null): string | null {
  if (value == null) return null;
  const s = value.normalize('NFKC').trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/) ?? s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 20261008 14:15:24・2026/10/08 14:15 → 日本時間の日時 */
export function toJstDateTime(value: string | null): Date | null {
  if (value == null) return null;
  const s = value.normalize('NFKC').trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
    ?? s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const p = (x: string) => x.padStart(2, '0');
  const d = new Date(`${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${m[5]}:${m[6] ?? '00'}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 室タイプ「01.NS 禁煙シングル」→ 記号 NS・名前 禁煙シングル */
export function parseRoomType(value: string | null): { code: string | null; name: string | null } {
  if (!value) return { code: null, name: null };
  const s = value.normalize('NFKC').trim();
  const m = s.match(/^(?:\d+\.)?([A-Z]{1,4})\s+(.+)$/);
  if (m) return { code: m[1], name: m[2].trim() };
  return { code: null, name: s };
}

/** 決済方法から、現地（フロント）で受け取る必要があるかを判断する */
export function requiresOnSitePayment(settlement: string | null): boolean {
  return !!settlement && /現地/.test(settlement);
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
    throw new RakutsuCsvError(`らく通の「予約一覧」の形式ではありません。必要な列がありません：${missing.join('、')}`);
  }
  const known = new Set(Object.values(RAKUTSU_COLUMNS).map(normalizeHeader));
  const unknownColumns = rows[0].filter((h) => h.trim() && !known.has(normalizeHeader(h)));

  const records = rows.slice(1).map((cells, k) => {
    const get = (field: RakutsuField): string | null => {
      const i = index[field];
      if (i === undefined) return null;
      const v = (cells[i] ?? '').trim();
      return v === '' ? null : v;
    };
    const rawPhone = get('phone');
    const phoneBroken = !!rawPhone && /e[+-]?\d/i.test(rawPhone);
    const roomTypeRaw = get('roomTypeRaw');
    const type = parseRoomType(roomTypeRaw);
    const record: RakutsuRecord = {
      line: k + 2,
      confirmMark: get('confirmMark'),
      printMark: get('printMark'),
      linkMark: get('linkMark'),
      status: get('status'),
      bookingNo: get('bookingNo'),
      arrival: toIsoDate(get('arrival')),
      departure: toIsoDate(get('departure')),
      nights: toInt(get('nights')),
      pax: toInt(get('pax')),
      roomCount: toInt(get('roomCount')),
      roomTypeRaw,
      roomTypeCode: type.code,
      roomType: type.name,
      planName: get('planName'),
      channel: get('channel'),
      guestName: get('guestName'),
      phone: phoneBroken ? null : rawPhone,
      phoneBroken,
      settlement: get('settlement'),
      couponPoints: toInt(get('couponPoints')),
      totalAmount: toInt(get('totalAmount')),
      memo: get('memo'),
      bookedAt: toJstDateTime(get('bookedAt')),
    };
    return record;
  });
  return { records, unknownColumns };
}
