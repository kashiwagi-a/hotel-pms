import { addDays } from './dates';

/**
 * インジケーターの客室状態
 * S 滞在中 / N 滞在中で翌日出発 / T 本日出発予定（未チェックアウト）/ A アサイン済み未到着
 * O チェックアウト済 / C 空室 / X 故障
 */
export type RoomState = 'S' | 'N' | 'T' | 'A' | 'O' | 'C' | 'X';

export const STATE_LABEL: Record<RoomState, string> = {
  S: '滞在中',
  N: '滞在中（翌日出発）',
  T: '本日出発予定',
  A: 'アサイン済み未到着',
  O: 'チェックアウト済',
  C: '空室',
  X: '故障',
};

export type ChipDef = { key: string; label: string; match: RoomState[]; swatch: RoomState; hideIfZero?: boolean };

export const CHIPS: ChipDef[] = [
  { key: 'stay', label: '滞在中', match: ['S', 'N', 'T'], swatch: 'S' },
  { key: 'next', label: 'うち翌日出発', match: ['N'], swatch: 'N' },
  { key: 'dueout', label: '本日出発予定', match: ['T'], swatch: 'T', hideIfZero: true },
  { key: 'asg', label: 'アサイン済み未到着', match: ['A'], swatch: 'A' },
  { key: 'out', label: 'チェックアウト済', match: ['O'], swatch: 'O' },
  { key: 'vac', label: '空室', match: ['C'], swatch: 'C' },
  { key: 'brk', label: '故障', match: ['X'], swatch: 'X' },
];

export type StayLike = {
  status: string;
  arrival: string | null;
  departure: string | null;
};

const CANCELLED = /キャンセル|取消|ノーショー|no.?show/i;
const CHECKED_OUT = /アウト|チェックアウト|退館/;
const IN_HOUSE = /滞在中|チェックイン|在室/;

export function isCancelled(status: string) {
  return CANCELLED.test(status);
}

/**
 * 営業日 date の夜の客室状態を決める。
 * date の夜に泊まる予約（到着日 ≦ date ＜ 出発日）を優先し、
 * 無ければ date に出発する予約から「本日出発予定」「チェックアウト済」を判定する。
 */
export function computeRoomState<T extends StayLike>(
  outOfOrder: boolean,
  reservations: T[],
  date: string,
): { state: RoomState; reservation: T | null } {
  const active = reservations.filter((r) => r.arrival && r.departure && !isCancelled(r.status));
  const staying = active.find((r) => r.arrival! <= date && date < r.departure!);
  if (outOfOrder && !staying) return { state: 'X', reservation: null };
  if (staying) {
    if (CHECKED_OUT.test(staying.status)) return { state: 'O', reservation: staying };
    if (IN_HOUSE.test(staying.status)) {
      return { state: staying.departure === addDays(date, 1) ? 'N' : 'S', reservation: staying };
    }
    return { state: 'A', reservation: staying };
  }
  const leaving = active.find((r) => r.departure === date);
  if (leaving) {
    if (CHECKED_OUT.test(leaving.status)) return { state: 'O', reservation: leaving };
    if (IN_HOUSE.test(leaving.status)) return { state: 'T', reservation: leaving };
  }
  return { state: 'C', reservation: null };
}
