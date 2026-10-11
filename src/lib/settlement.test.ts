import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCheckIn, effectiveStatus, parsePaymentMethod, parseYen, summarizeMoney } from './settlement';

test('未収と預り金残高を計算する', () => {
  const m = summarizeMoney({ settlement: '現地精算', billed: 8700, received: 0 }, [
    { kind: 'payment', source: 'manual', amount: 3000 },
    { kind: 'payment', source: 'import', amount: 9999 },
    { kind: 'deposit', source: 'manual', amount: 10000 },
    { kind: 'refund', source: 'manual', amount: 2000 },
  ]);
  assert.equal(m.remaining, 5700);
  assert.equal(m.paidHere, 3000);
  assert.equal(m.depositBalance, 8000);
});

test('予約サイトで決済済み（精算不要）なら受け取る金額は 0', () => {
  const m = summarizeMoney({ settlement: '精算不要', billed: 16550, received: 0 }, []);
  assert.equal(m.remaining, 0);
  assert.equal(m.prepaidOnline, true);
});

test('らく通で受領済みの分は差し引く', () => {
  assert.equal(summarizeMoney({ settlement: '現地精算', billed: 22200, received: 22200 }, []).remaining, 0);
});

test('チェックインできる条件', () => {
  const base = { status: '予約', localCheckedInAt: null, arrival: '2026-10-11', departure: '2026-10-12' };
  assert.equal(canCheckIn(base, '2026-10-11').ok, true);
  assert.equal(canCheckIn(base, '2026-10-10').ok, false);
  assert.equal(canCheckIn({ ...base, status: '滞在中' }, '2026-10-11').ok, false);
  assert.equal(canCheckIn({ ...base, status: 'キャンセル' }, '2026-10-11').ok, false);
  assert.equal(canCheckIn({ ...base, localCheckedInAt: new Date() }, '2026-10-11').ok, false);
});

test('この画面でチェックインした予約は滞在中として扱う', () => {
  assert.equal(effectiveStatus({ status: '予約', localCheckedInAt: new Date() }), '滞在中');
  assert.equal(effectiveStatus({ status: '予約', localCheckedInAt: null }), '予約');
  assert.equal(effectiveStatus({ status: 'アウト', localCheckedInAt: new Date() }), 'アウト');
});

test('支払方法はブランドの選択が必須（現金を除く）', () => {
  assert.deepEqual(parsePaymentMethod('cash', ''), { ok: true, method: '現金', brand: null, isCash: true });
  assert.equal(parsePaymentMethod('card', '').ok, false);
  assert.equal(parsePaymentMethod('card', 'NOT A BRAND').ok, false);
  assert.deepEqual(parsePaymentMethod('qr', 'PayPay'), { ok: true, method: 'QR決済', brand: 'PayPay', isCash: false });
  assert.equal(parsePaymentMethod('invoice', '').ok, false);
});

test('金額の入力を整数の円として読む', () => {
  assert.equal(parseYen('10,000'), 10000);
  assert.equal(parseYen('１０００'), 1000);
  assert.equal(parseYen(''), 0);
  assert.equal(parseYen('-5'), null);
  assert.equal(parseYen('1.5'), null);
  assert.equal(parseYen('99999999'), null);
});
