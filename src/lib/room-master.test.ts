import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRoomMaster } from './room-master';

test('客室マスタの CSV を読む', () => {
  const rows = parseRoomMaster('施設,部屋番号,階,館,タイプ,タイプ記号,定員\n"古河駅前",601,6,本館,"禁煙 FD（3名）",NFD,3\n古河駅前,2201,22,,別館 BF（1名）,,\n');
  assert.deepEqual(rows, [
    { facility: '古河駅前', number: '601', floor: 6, building: '本館', type: '禁煙 FD（3名）', typeCode: 'NFD', capacity: 3 },
    { facility: '古河駅前', number: '2201', floor: 22, building: null, type: '別館 BF（1名）', typeCode: null, capacity: null },
  ]);
});

test('壊れた行はエラーにする', () => {
  assert.throws(() => parseRoomMaster('施設,部屋番号,階,タイプ\n古河駅前,201,二,禁煙シングル\n'));
  assert.throws(() => parseRoomMaster('施設,部屋番号\n古河駅前,201\n'));
});

test('同梱の古河駅前の客室マスタは 292 室で、部屋番号が重ならない', () => {
  const rows = parseRoomMaster(readFileSync(join(__dirname, '../../data/rooms/koga-ekimae.csv'), 'utf8'));
  assert.equal(rows.length, 292);
  assert.equal(new Set(rows.map((r) => r.number)).size, 292);
});
