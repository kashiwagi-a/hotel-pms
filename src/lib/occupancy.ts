/**
 * 稼働・売上の集計（ダッシュボード・在庫・レポートで共通）
 * - 取消の予約は数えない
 * - 販売室数は「その夜に泊まる予約の室数」の合計（部屋割りの有無に関係なく数える）
 * - 売上はポイント割引後額を泊数で割って 1 泊ずつに振り分ける
 */
import { diffDays } from './dates';
import { isCancelled } from './indicator';

export type StayRecord = {
  status: string;
  arrival: string | null;
  departure: string | null;
  roomCount: number;
  totalAmount: number;
  roomTypeCode: string | null;
};

export function isActive(r: { status: string }): boolean {
  return !isCancelled(r.status);
}

/** その夜（date）に泊まるか */
export function staysOn(r: { arrival: string | null; departure: string | null }, date: string): boolean {
  return !!r.arrival && !!r.departure && r.arrival <= date && date < r.departure;
}

/** 期間 [from, to) に含まれる泊数 */
export function nightsWithin(r: { arrival: string | null; departure: string | null }, from: string, to: string): number {
  if (!r.arrival || !r.departure) return 0;
  const a = r.arrival > from ? r.arrival : from;
  const b = r.departure < to ? r.departure : to;
  return Math.max(0, diffDays(a, b));
}

/** 1 泊あたりの売上（予約全体の金額を泊数で割る） */
export function revenuePerNight(r: StayRecord): number {
  if (!r.arrival || !r.departure) return 0;
  const nights = Math.max(1, diffDays(r.arrival, r.departure));
  return r.totalAmount / nights;
}

/** その夜の販売室数 */
export function soldRoomsOn(rs: StayRecord[], date: string, typeCode?: string | null): number {
  return rs
    .filter((r) => isActive(r) && staysOn(r, date) && (typeCode === undefined || r.roomTypeCode === typeCode))
    .reduce((s, r) => s + r.roomCount, 0);
}

export type PeriodStats = {
  days: number;
  capacity: number;
  roomNights: number;
  revenue: number;
  occupancy: number;
  adr: number;
  revpar: number;
};

/** 期間の稼働率・ADR（平均客室単価）・RevPAR（販売可能 1 室あたり売上） */
export function periodStats(rs: StayRecord[], rooms: number, from: string, to: string): PeriodStats {
  const days = Math.max(0, diffDays(from, to));
  const capacity = rooms * days;
  let roomNights = 0;
  let revenue = 0;
  for (const r of rs) {
    if (!isActive(r)) continue;
    const n = nightsWithin(r, from, to);
    roomNights += n * r.roomCount;
    revenue += n * revenuePerNight(r);
  }
  revenue = Math.round(revenue);
  return {
    days, capacity, roomNights, revenue,
    occupancy: capacity ? roomNights / capacity : 0,
    adr: roomNights ? Math.round(revenue / roomNights) : 0,
    revpar: capacity ? Math.round(revenue / capacity) : 0,
  };
}
