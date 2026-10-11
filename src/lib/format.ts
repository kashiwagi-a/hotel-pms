const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/** 金額表示（整数の円） */
export function yen(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value < 0 ? '−' : ''}¥${Math.abs(value).toLocaleString('ja-JP')}`;
}

/** 2026-10-11 → 10/11（日） */
export function formatDateJa(date: string | null | undefined, withYear = false): string {
  if (!date) return '—';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const head = withYear ? `${d.getUTCFullYear()}/` : '';
  return `${head}${d.getUTCMonth() + 1}/${d.getUTCDate()}（${DOW[d.getUTCDay()]}）`;
}

/** 日時を日本時間で表示 */
export function formatDateTimeJst(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
