import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeCsvBytes, parseCsv, parseRakutsuCsv, parseRoomType, requiresOnSitePayment, toIsoDate, toJstDateTime, RakutsuCsvError,
} from './rakutsu-csv';
import { computeRoomState } from './indicator';
import { reservationKey } from './import-rakutsu';

const HEADER = '確認,印刷,連動,区分,予約番号（印字されている部分のみ）,チェックイン,チェックアウト,泊数,人数,室数,室タイプ,プラン（印字されている部分のみ）,エージェント,お客様名,電話番号（印字のまま）,決済方法,ポイント額,ポイント割引後額,予約メモ,受信日／登録日';

test('引用符の中のカンマと改行を 1 つの値として読む', () => {
  assert.deepEqual(parseCsv('a,"b,c","d\ne"\r\n1,2,3\n'), [['a', 'b,c', 'd\ne'], ['1', '2', '3']]);
});

test('室タイプから記号と名前を分ける', () => {
  assert.deepEqual(parseRoomType('01.NS 禁煙シングル'), { code: 'NS', name: '禁煙シングル' });
  assert.deepEqual(parseRoomType('09.ANT アネックス禁煙ツイン'), { code: 'ANT', name: 'アネックス禁煙ツイン' });
  assert.deepEqual(parseRoomType('ZS 加熱式たばこ専用シン'), { code: 'ZS', name: '加熱式たばこ専用シン' });
  assert.deepEqual(parseRoomType('和室'), { code: null, name: '和室' });
});

test('決済方法から現地での支払いが必要か判断する', () => {
  assert.equal(requiresOnSitePayment('現地決済'), true);
  assert.equal(requiresOnSitePayment('現地精算'), true);
  assert.equal(requiresOnSitePayment('精算不要(事前カード決済)'), false);
  assert.equal(requiresOnSitePayment('事前決済(カード決済)'), false);
  assert.equal(requiresOnSitePayment('法人決済'), false);
});

test('日付と日時を読む', () => {
  assert.equal(toIsoDate('20261011'), '2026-10-11');
  assert.equal(toIsoDate('2026/10/7'), '2026-10-07');
  assert.equal(toJstDateTime('20261008 14:15:24')?.toISOString(), '2026-10-08T05:15:24.000Z');
});

test('Shift_JIS の CSV も読める', () => {
  assert.equal(decodeCsvBytes(new Uint8Array([0x95, 0x94, 0x89, 0xae])), '部屋');
});

test('予約一覧の 1 行を読む（見出しの注記は無視する）', () => {
  const csv = `${HEADER}\n未,未,済,予約,AB12345,20261011,20261013,2,4,3,09.ANT アネックス禁煙ツイン,朝食付きプラン,じゃらん net,テスト タロウ,8.02E+09,現地決済,100,"43,200",駐車場あり,20261007 17:34:41\n`;
  const { records, unknownColumns } = parseRakutsuCsv(csv);
  assert.equal(unknownColumns.length, 0);
  const r = records[0];
  assert.equal(r.status, '予約');
  assert.equal(r.arrival, '2026-10-11');
  assert.equal(r.departure, '2026-10-13');
  assert.equal(r.roomCount, 3);
  assert.equal(r.roomTypeCode, 'ANT');
  assert.equal(r.totalAmount, 43200);
  assert.equal(r.couponPoints, 100);
  assert.equal(r.phone, null);
  assert.equal(r.phoneBroken, true);
  assert.equal(r.memo, '駐車場あり');
  assert.equal(reservationKey(r), 'B:AB12345');
});

test('必要な列が無ければ分かりやすいエラーにする', () => {
  assert.throws(() => parseRakutsuCsv('氏名,金額\nA,1\n'), RakutsuCsvError);
});

test('インジケーターの状態判定', () => {
  const d = '2026-10-10';
  const st = (status: string, arrival: string, departure: string) => computeRoomState(false, [{ status, arrival, departure }], d).state;
  assert.equal(st('滞在中', '2026-10-09', '2026-10-13'), 'S');
  assert.equal(st('滞在中', '2026-10-10', '2026-10-11'), 'N');
  assert.equal(st('チェックアウト済', '2026-10-07', '2026-10-11'), 'O');
  assert.equal(st('予約', '2026-10-10', '2026-10-11'), 'A');
  assert.equal(st('変更', '2026-10-10', '2026-10-11'), 'A');
  assert.equal(st('滞在中', '2026-10-08', '2026-10-10'), 'T');
  assert.equal(st('取消', '2026-10-10', '2026-10-11'), 'C');
  assert.equal(computeRoomState(true, [], d).state, 'X');
});
