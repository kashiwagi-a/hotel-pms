/** 状態・決済方法を色分けするためのクラス名 */
export function statusTone(status: string): '' | 'ok' | 'warn' | 'info' {
  if (/取消|キャンセル|ノーショー/.test(status)) return '';
  if (/チェックアウト/.test(status)) return '';
  if (/滞在中/.test(status)) return 'info';
  if (/変更/.test(status)) return 'warn';
  if (/予約/.test(status)) return 'ok';
  return 'warn';
}

export function settlementTone(onSite: boolean, remaining: number): '' | 'ok' | 'warn' | 'info' {
  if (remaining > 0) return 'warn';
  if (!onSite) return 'info';
  return 'ok';
}
