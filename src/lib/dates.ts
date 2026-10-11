// 日付はタイムゾーンのずれを避けるため、日付だけの値を "YYYY-MM-DD" 文字列で扱う

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD に日数を足す */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD 形式で実在する日付か */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 2 つの日付の差（日数） */
export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** from から to の前日までの日付の一覧（to は含まない） */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** 2026-10 → { from: 2026-10-01, to: 2026-11-01 } */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { from, to: d.toISOString().slice(0, 10) };
}

/** 日本時間の 1 日（0 時〜翌 0 時）を Date の範囲で返す */
export function jstDayRange(date: string): { start: Date; end: Date } {
  return { start: new Date(`${date}T00:00:00+09:00`), end: new Date(`${addDays(date, 1)}T00:00:00+09:00`) };
}

/** Date を日本時間の日付（YYYY-MM-DD）にする */
export function jstDateOf(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
