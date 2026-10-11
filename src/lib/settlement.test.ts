import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCE_METHOD, canCheckIn, canCheckOut, effectiveStatus, needsBrand, parsePaymentMethod, parseYen, splitAdvance, summarizeMoney } from './settlement';

test('現地決済の未収と預り金残高を計算する', () => {
  const m = summarizeMoney({ settlement: '現地決済', billed: 8700 }, [
    { kind: 'payment', source: 'manual', amount: 3000 },
    { kind: 'deposit', source: 'manual', amount: 10000 },
    { kind: 'refund', source: 'manual', amount: 2000 },
  ]);
  assert.equal(m.remaining, 5700);
  assert.equal(m.paidHere, 3000);
  assert.equal(m.depositBalance, 8000);
  assert.equal(m.prepaidOnline, false);
});

test('事前決済・法人決済なら現地で受け取る金額は 0', () => {
  assert.equal(summarizeMoney({ settlement: '精算不要(事前カード決済)', billed: 0 }, []).remaining, 0);
  assert.equal(summarizeMoney({ settlement: '法人決済', billed: 8550 }, []).remaining, 0);
});

test('チェックインできる条件（部屋割りが済んでいること）', () => {
  const base = { status: '予約', localCheckedInAt: null, arrival: '2026-10-11', departure: '2026-10-12', roomCount: 2 };
  assert.equal(canCheckIn(base, '2026-10-11', 2).ok, true);
  assert.equal(canCheckIn(base, '2026-10-11', 1).ok, false);
  assert.equal(canCheckIn(base, '2026-10-10', 2).ok, false);
  assert.equal(canCheckIn({ ...base, status: '取消' }, '2026-10-11', 2).ok, false);
  assert.equal(canCheckIn({ ...base, localCheckedInAt: new Date() }, '2026-10-11', 2).ok, false);
});

test('チェックアウトできる条件', () => {
  assert.equal(canCheckOut({ localCheckedInAt: null }).ok, false);
  assert.equal(canCheckOut({ localCheckedInAt: new Date() }).ok, true);
  assert.equal(canCheckOut({ localCheckedInAt: new Date(), localCheckedOutAt: new Date() }).ok, false);
});

test('らく通の区分に、この画面でのチェックイン・アウトを重ねる', () => {
  assert.equal(effectiveStatus({ status: '予約', localCheckedInAt: new Date() }), '滞在中');
  assert.equal(effectiveStatus({ status: '変更', localCheckedInAt: null }), '変更');
  assert.equal(effectiveStatus({ status: '予約', localCheckedInAt: new Date(), localCheckedOutAt: new Date() }), 'チェックアウト済');
});

test('支払方法はブランドの選択が必須（現金を除く）', () => {
  assert.deepEqual(parsePaymentMethod('cash', ''), { ok: true, method: '現金', brand: null, isCash: true });
  assert.equal(parsePaymentMethod('card', '').ok, false);
  assert.deepEqual(parsePaymentMethod('qr', 'PayPay'), { ok: true, method: 'QR決済', brand: 'PayPay', isCash: false });
  assert.equal(parsePaymentMethod('invoice', '').ok, false);
});

test('金額の入力を整数の円として読む', () => {
  assert.equal(parseYen('10,000'), 10000);
  assert.equal(parseYen('１０００'), 1000);
  assert.equal(parseYen(''), 0);
  assert.equal(parseYen('-5'), null);
  assert.equal(parseYen('99999999'), null);
});

test('前受金の残高は、受入から返金と振替を引く', () => {
  const m = summarizeMoney({ settlement: '現地決済', billed: 20000 }, [
    { kind: 'advance', source: 'manual', amount: 15000, method: '銀行振込' },
    { kind: 'advance_refund', source: 'manual', amount: 1000, method: '現金' },
    { kind: 'payment', source: 'manual', amount: 12000, method: ADVANCE_METHOD },
  ]);
  assert.equal(m.advanceBalance, 2000);
  assert.equal(m.paidHere, 12000);
  assert.equal(m.remaining, 8000);
  assert.equal(m.depositBalance, 0);
});

test('前受金はまず宿泊料等に充当し、余りを預り金へ振り替える', () => {
  assert.deepEqual(splitAdvance(5000, 8000), { applied: 5000, toDeposit: 0 });
  assert.deepEqual(splitAdvance(10000, 8000), { applied: 8000, toDeposit: 2000 });
  assert.deepEqual(splitAdvance(3000, 0), { applied: 0, toDeposit: 3000 });
  assert.deepEqual(splitAdvance(0, 8000), { applied: 0, toDeposit: 0 });
});

test('銀行振込は前受金のときだけ選べる', () => {
  assert.equal(parsePaymentMethod('transfer', '').ok, false);
  const pm = parsePaymentMethod('transfer', '', { allowTransfer: true });
  assert.equal(pm.ok && pm.method, '銀行振込');
  assert.equal(needsBrand('transfer', ''), false);
  assert.equal(needsBrand('card', ''), true);
});
