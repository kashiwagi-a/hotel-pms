/** 10 階以下は本館、11 階以上は別館（清掃システムと同じ判定） */
export function buildingOf(floor: number): string {
  return floor <= 10 ? '本館' : '別館';
}
