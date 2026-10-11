import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedCash, parseDenominations, summarizeByMethod, totalOfDenominations } from './accounting';

test('理論在高：現金の前受金は足し、前受金からの振替は数えない', () => {
  const rows = [
    { kind: 'payment', method: '現金', brand: null, amount: 8000 },
    { kind: 'advance', method: '現金', brand: null, amount: 5000 },
    { kind: 'advance_refund', method: '現金', brand: null, amount: 1000 },
    { kind: 'refund', method: '現金', brand: null, amount: 2000 },
    { kind: 'payment', method: '前受金', brand: null, amount: 4000 },
  ];
  assert.equal(expectedCash(rows, 50000), 60000);
  const byMethod = summarizeByMethod(rows);
  assert.equal(byMethod.length, 1);
  assert.deepEqual({ ...byMethod[0] }, { label: '現金', isCash: true, payment: 8000, deposit: 0, advance: 5000, refund: 3000, count: 4 });
});

test('金種の枚数から合計を出す', () => {
  assert.equal(totalOfDenominations({ 10000: 3, 5000: 1, 1000: 12, 500: 2, 100: 7, 10: 3, 1: 4 }), 48734);
  assert.equal(totalOfDenominations({}), 0);
});

test('保存した金種の JSON を読む', () => {
  assert.deepEqual(parseDenominations('{"10000":2,"1":5,"3":9,"500":-1}'), { 10000: 2, 1: 5 });
  assert.equal(parseDenominations('壊れた'), null);
  assert.equal(parseDenominations(null), null);
});
