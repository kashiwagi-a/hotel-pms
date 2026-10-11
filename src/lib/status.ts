/** らく通のステータス・決済方法を色分けするためのクラス名 */
export function statusTone(status: string): '' | 'ok' | 'warn' | 'info' {
  if (/キャンセル|取消|ノーショー/.test(status)) return '';
  if (/アウト|チェックアウト/.test(status)) return '';
  if (/滞在中|チェックイン/.test(status)) return 'info';
  if (/予約|確定/.test(status)) return 'ok';
  return 'warn';
}

export function settlementTone(settlement: string | null, unpaid: number): '' | 'ok' | 'warn' | 'info' {
  if (unpaid > 0) return 'warn';
  if (settlement === '精算不要') return 'info';
  return 'ok';
}
