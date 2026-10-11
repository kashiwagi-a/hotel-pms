import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeRoomsFor, overlaps, planAutoAssign, type RoomLike } from './assignment';

const rooms: RoomLike[] = [
  { id: 1, number: '201', floor: 2, typeCode: 'NS', outOfOrder: false },
  { id: 2, number: '202', floor: 2, typeCode: 'NS', outOfOrder: false },
  { id: 3, number: '203', floor: 2, typeCode: 'NS', outOfOrder: true },
  { id: 4, number: '301', floor: 3, typeCode: 'NT', outOfOrder: false },
  { id: 5, number: '302', floor: 3, typeCode: 'NT', outOfOrder: false },
  { id: 6, number: '401', floor: 4, typeCode: 'NT', outOfOrder: false },
];

test('滞在期間の重なり（同じ日のチェックアウトとチェックインは重ならない）', () => {
  assert.equal(overlaps({ arrival: '2026-10-10', departure: '2026-10-12' }, { arrival: '2026-10-11', departure: '2026-10-13' }), true);
  assert.equal(overlaps({ arrival: '2026-10-10', departure: '2026-10-12' }, { arrival: '2026-10-12', departure: '2026-10-13' }), false);
});

test('空室はタイプ一致を先に、故障と使用中を除いて返す', () => {
  const b = { id: 10, status: '予約', arrival: '2026-10-11', departure: '2026-10-12', roomTypeCode: 'NS' };
  const busy = [{ roomId: 1, reservation: { id: 11, status: '予約', arrival: '2026-10-10', departure: '2026-10-12', roomTypeCode: 'NS' } }];
  assert.deepEqual(freeRoomsFor(b, rooms, busy, { sameTypeOnly: true }).map((r) => r.number), ['202']);
  // 取消になった予約の部屋は空いている扱い
  const cancelled = [{ roomId: 1, reservation: { ...busy[0].reservation, status: '取消' } }];
  assert.deepEqual(freeRoomsFor(b, rooms, cancelled, { sameTypeOnly: true }).map((r) => r.number), ['201', '202']);
});

test('自動アサインは複数室を同じ階にまとめ、足りない予約は残す', () => {
  const plan = planAutoAssign([
    { id: 20, status: '予約', arrival: '2026-10-11', departure: '2026-10-12', roomTypeCode: 'NT', roomCount: 2, assigned: 0 },
    { id: 21, status: '予約', arrival: '2026-10-11', departure: '2026-10-12', roomTypeCode: 'NT', roomCount: 2, assigned: 0 },
    { id: 22, status: '予約', arrival: '2026-10-11', departure: '2026-10-12', roomTypeCode: 'NS', roomCount: 1, assigned: 0 },
  ], rooms, []);
  assert.deepEqual(plan.filter((p) => p.reservationId === 20).map((p) => p.roomId), [4, 5]);
  assert.equal(plan.filter((p) => p.reservationId === 21).length, 0);
  assert.deepEqual(plan.filter((p) => p.reservationId === 22).map((p) => p.roomId), [1]);
});

test('同じ日に前のお客様が出発する部屋は後回しにする', () => {
  const b = { id: 30, status: '予約', arrival: '2026-10-12', departure: '2026-10-13', roomTypeCode: 'NS' };
  const leaving = [{ roomId: 1, reservation: { id: 31, status: '滞在中', arrival: '2026-10-11', departure: '2026-10-12', roomTypeCode: 'NS' } }];
  assert.deepEqual(freeRoomsFor(b, rooms, leaving, { sameTypeOnly: true }).map((r) => r.number), ['202', '201']);
});
