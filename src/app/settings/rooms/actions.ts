'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { floorOf } from '@/lib/import-rakutsu';

export type RoomsState = { ok: boolean; message: string } | null;

function refresh() {
  revalidatePath('/settings/rooms');
  revalidatePath('/indicator');
}

/**
 * 1 行に 1 つずつ「部屋番号 部屋タイプ」または「開始-終了 部屋タイプ」で登録する
 * 例：201-216 禁煙シングル
 */
export async function addRoomsAction(_prev: RoomsState, formData: FormData): Promise<RoomsState> {
  const text = String(formData.get('rooms') ?? '').normalize('NFKC');
  const facility = await getCurrentFacility();
  const errors: string[] = [];
  const rooms: { number: string; type: string }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(/^\s*(\d+)\s*(?:[-~〜ー]\s*(\d+))?\s+(.+?)\s*$/);
    if (!m) {
      errors.push(`${i + 1} 行目を読めませんでした（例：201-216 禁煙シングル）`);
      return;
    }
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (to < from || to - from > 300) {
      errors.push(`${i + 1} 行目の範囲が正しくありません`);
      return;
    }
    for (let n = from; n <= to; n++) rooms.push({ number: String(n), type: m[3] });
  });
  if (errors.length) return { ok: false, message: errors.join(' / ') };
  if (!rooms.length) return { ok: false, message: '登録する部屋を入力してください。' };

  let created = 0;
  let updated = 0;
  for (const r of rooms) {
    const where = { facilityId_number: { facilityId: facility.id, number: r.number } };
    const exists = await prisma.room.findUnique({ where, select: { id: true } });
    await prisma.room.upsert({
      where,
      create: { facilityId: facility.id, number: r.number, floor: floorOf(r.number), type: r.type },
      update: { type: r.type },
    });
    if (exists) updated++;
    else created++;
  }
  refresh();
  return { ok: true, message: `新規 ${created} 室を登録し、${updated} 室の部屋タイプを更新しました。` };
}

export async function toggleOutOfOrderAction(formData: FormData) {
  const id = Number(formData.get('id'));
  const facility = await getCurrentFacility();
  const room = await prisma.room.findFirst({ where: { id, facilityId: facility.id } });
  if (!room) return;
  await prisma.room.update({ where: { id }, data: { outOfOrder: !room.outOfOrder } });
  refresh();
}

export async function deleteRoomAction(formData: FormData) {
  const id = Number(formData.get('id'));
  const facility = await getCurrentFacility();
  const room = await prisma.room.findFirst({ where: { id, facilityId: facility.id }, include: { _count: { select: { assignments: true } } } });
  // 部屋割りが入っている部屋は消さない（予約の部屋情報が失われるため）
  if (!room || room._count.assignments > 0) return;
  await prisma.room.delete({ where: { id } });
  refresh();
}

export async function renameFacilityAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const facility = await getCurrentFacility();
  await prisma.facility.update({ where: { id: facility.id }, data: { name } });
  revalidatePath('/', 'layout');
}

export async function deleteSampleAction() {
  const facility = await getCurrentFacility();
  await prisma.reservation.deleteMany({ where: { facilityId: facility.id, isSample: true } });
  revalidatePath('/', 'layout');
}

/** 部屋タイプ名をまとめて変更する（同じ名前の部屋すべて） */
export async function renameRoomTypeAction(formData: FormData) {
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '').trim().slice(0, 50);
  if (!from || !to || from === to) return;
  const facility = await getCurrentFacility();
  await prisma.room.updateMany({ where: { facilityId: facility.id, type: from }, data: { type: to } });
  refresh();
  revalidatePath('/reservations');
}

/** らく通の予約にある「記号 → 室タイプ名」に合わせて、客室マスタの部屋タイプ名をまとめて変える */
export async function syncTypeNamesAction() {
  const facility = await getCurrentFacility();
  const { rakutsuTypeNames } = await import('@/lib/room-types');
  const names = await rakutsuTypeNames(prisma, facility.id);
  for (const [code, name] of names) {
    await prisma.room.updateMany({ where: { facilityId: facility.id, typeCode: code }, data: { type: name } });
  }
  refresh();
  revalidatePath('/reservations', 'layout');
}
