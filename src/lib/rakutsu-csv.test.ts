import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsvBytes, parseCsv, parseRakutsuCsv, parseReceipts, toIsoDate, toJstDateTime, RakutsuCsvError } from './rakutsu-csv';
import { computeRoomState } from './indicator';
import { reservationKey } from './import-rakutsu';

const HEADER = '予約番号,部屋番号,部屋タイプ,到着日,出発日,泊数,宿泊者名,電話番号,人数,グループ,ステータス,チェックイン時間,販売経路,食事条件,決済方法,泊ごとの料金,クーポン・ポイント,合計金額(税込・割引後),追加費用,追加費用の内訳,ご請求,受領済み,未収,受領の内訳,その他備考,フロント備考,登録日時,登録者,最終更新日時,最終更新者';

test('引用符の中のカンマと改行を 1 つの値として読む', () => {
  const rows = parseCsv('a,"b,c","d\ne"\r\n1,2,3\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd\ne'], ['1', '2', '3']]);
});

test('受領の内訳からブランドとレジを分けて読む', () => {
  assert.deepEqual(parseReceipts('22,200円 クレジットカード(VISA)(古河駅前 フロント 10/10 16:19)'), [
    { amount: 22200, method: 'クレジットカード', brand: 'VISA', register: '古河駅前 フロント 10/10 16:19', raw: '22,200円 クレジットカード(VISA)(古河駅前 フロント 10/10 16:19)' },
  ]);
  const cash = parseReceipts('7,050円 現金(古河駅前 フロント 10…');
  assert.equal(cash[0].amount, 7050);
  assert.equal(cash[0].method, '現金');
  assert.equal(cash[0].brand, null);
  assert.equal(cash[0].register, '古河駅前 フロント 10…');
  const qr = parseReceipts('26,505円 QR決済(PayPay)(フロント)');
  assert.equal(qr[0].brand, 'PayPay');
});

test('日付と日時を読む', () => {
  assert.equal(toIsoDate('2026/10/7'), '2026-10-07');
  assert.equal(toJstDateTime('2026/10/08 13:14')?.toISOString(), '2026-10-08T04:14:00.000Z');
});

test('Shift_JIS の CSV も読める', () => {
  // 「部屋」を Shift_JIS で表したバイト列
  const sjis = new Uint8Array([0x95, 0x94, 0x89, 0xae]);
  assert.equal(decodeCsvBytes(sjis), '部屋');
});

test('宿泊者一覧の 1 行を読む', () => {
  const csv = `${HEADER}\nRK0001_2,211,禁煙シングル,2026/10/10,2026/10/12,2,テスト タロウ,,1,,滞在中,2026/10/10 17:24,楽天トラベル,朝食付き,現地精算,,187,"18,563",0,,18563,18563,0,"18,563円 クレジットカード(JCB)(フロント)",早割プラン,宿泊者変更あり,2026/10/09 18:46,フロント,2026/10/10 17:24,フロント\n`;
  const { records } = parseRakutsuCsv(csv);
  assert.equal(records.length, 1);
  const r = records[0];
  assert.equal(r.roomNumber, '211');
  assert.equal(r.arrival, '2026-10-10');
  assert.equal(r.totalAmount, 18563);
  assert.equal(r.couponPoints, 187);
  assert.equal(r.receipts[0].brand, 'JCB');
  assert.equal(reservationKey(r), 'B:RK0001_2');
});

test('必要な列が無ければ分かりやすいエラーにする', () => {
  assert.throws(() => parseRakutsuCsv('氏名,金額\nA,1\n'), RakutsuCsvError);
});

test('インジケーターの状態判定', () => {
  const d = '2026-10-10';
  const st = (status: string, arrival: string, departure: string) => computeRoomState(false, [{ status, arrival, departure }], d).state;
  assert.equal(st('滞在中', '2026-10-09', '2026-10-13'), 'S');
  assert.equal(st('滞在中', '2026-10-10', '2026-10-11'), 'N');
  assert.equal(st('アウト', '2026-10-07', '2026-10-11'), 'O');
  assert.equal(st('予約', '2026-10-10', '2026-10-11'), 'A');
  assert.equal(st('滞在中', '2026-10-08', '2026-10-10'), 'T');
  assert.equal(st('キャンセル', '2026-10-10', '2026-10-11'), 'C');
  assert.equal(computeRoomState(true, [], d).state, 'X');
});
