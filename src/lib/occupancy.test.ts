import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightsWithin, periodStats, soldRoomsOn } from './occupancy';
import { eachDay, jstDateOf, monthRange } from './dates';

const r = (o: Partial<{ status: string; arrival: string; departure: string; roomCount: number; totalAmount: number; roomTypeCode: string | null }>) => ({
  status: '予約', arrival: '2026-10-10', departure: '2026-10-12', roomCount: 1, totalAmount: 20000, roomTypeCode: 'NS', ...o,
});

test('期間に含まれる泊数', () => {
  assert.equal(nightsWithin(r({}), '2026-10-01', '2026-11-01'), 2);
  assert.equal(nightsWithin(r({}), '2026-10-11', '2026-11-01'), 1);
  assert.equal(nightsWithin(r({}), '2026-10-12', '2026-11-01'), 0);
});

test('その夜の販売室数（取消は数えない、室数を足す）', () => {
  const rs = [r({ roomCount: 2 }), r({ status: '取消' }), r({ roomTypeCode: 'NT' })];
  assert.equal(soldRoomsOn(rs, '2026-10-11'), 3);
  assert.equal(soldRoomsOn(rs, '2026-10-11', 'NS'), 2);
  assert.equal(soldRoomsOn(rs, '2026-10-12'), 0);
});

test('稼働率・ADR・RevPAR', () => {
  // 10 室 × 2 泊 = 20 室泊のうち、2 室 × 2 泊 + 1 室 × 1 泊 = 5 室泊
  const rs = [r({ roomCount: 2, totalAmount: 40000 }), r({ arrival: '2026-10-11', departure: '2026-10-12', totalAmount: 9000 })];
  const s = periodStats(rs, 10, '2026-10-10', '2026-10-12');
  assert.equal(s.roomNights, 5);
  assert.equal(s.revenue, 49000);
  assert.equal(s.occupancy, 0.25);
  assert.equal(s.adr, 9800);
  assert.equal(s.revpar, 2450);
});

test('日付の補助', () => {
  assert.deepEqual(eachDay('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2027-01-01' });
  assert.equal(jstDateOf(new Date('2026-10-11T16:00:00Z')), '2026-10-12');
});
