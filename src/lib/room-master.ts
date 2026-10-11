/**
 * 客室マスタの CSV（data/rooms/*.csv）
 * 新しい PC や新しい店舗でデータベースを作るとき、この CSV から施設と客室を登録する。
 * 部屋番号・タイプなどの設備の情報だけで、お客様の情報は含めない。
 *
 * 列：施設,部屋番号,階,館,タイプ,タイプ記号,定員
 */
import { parseCsv } from './rakutsu-csv';

export type RoomMasterRow = {
  facility: string;
  number: string;
  floor: number;
  building: string | null;
  type: string;
  typeCode: string | null;
  capacity: number | null;
};

const HEADER = ['施設', '部屋番号', '階', '館', 'タイプ', 'タイプ記号', '定員'];

export function parseRoomMaster(text: string): RoomMasterRow[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) return [];
  const head = rows[0].map((h) => h.trim());
  const col = HEADER.map((h) => head.indexOf(h));
  const missing = HEADER.filter((h, i) => col[i] < 0 && h !== '館' && h !== 'タイプ記号' && h !== '定員');
  if (missing.length) throw new Error(`客室マスタの CSV に列がありません：${missing.join('・')}`);
  const cell = (r: string[], i: number) => (col[i] >= 0 ? (r[col[i]] ?? '').trim() : '');
  const out: RoomMasterRow[] = [];
  rows.slice(1).forEach((r, i) => {
    if (r.every((c) => c.trim() === '')) return;
    const floor = Number(cell(r, 2));
    const capacity = cell(r, 6) === '' ? null : Number(cell(r, 6));
    const row = {
      facility: cell(r, 0), number: cell(r, 1), floor, building: cell(r, 3) || null,
      type: cell(r, 4), typeCode: cell(r, 5) || null, capacity,
    };
    if (!row.facility || !row.number || !row.type || !Number.isInteger(floor) || (capacity !== null && !Number.isInteger(capacity))) {
      throw new Error(`客室マスタの CSV の ${i + 2} 行目が正しくありません。`);
    }
    out.push(row);
  });
  return out;
}
