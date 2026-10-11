'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { addDays, isIsoDate } from '@/lib/dates';
import { formatDateJa } from '@/lib/format';

export type DayResult = { ok: true; message: string } | { ok: false; error: string } | null;

/** ナイトオーディット：今の営業日を締めて、翌日へ進める */
export async function advanceBusinessDayAction(_prev: DayResult, formData: FormData): Promise<DayResult> {
  const expected = String(formData.get('expected') ?? '');
  const facility = await getCurrentFacility();
  const current = await getBusinessDate();
  // 別の画面で先に進めていた場合は、二重に進めない
  if (expected !== current) return { ok: false, error: `営業日はすでに ${formatDateJa(current, true)} に変わっています。画面を開き直してください。` };
  const next = addDays(current, 1);
  const note = String(formData.get('note') ?? '').trim().slice(0, 200) || null;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.facility.updateMany({ where: { id: facility.id, businessDate: current }, data: { businessDate: next } });
    if (u.count > 0) {
      await tx.dayClose.upsert({
        where: { facilityId_date: { facilityId: facility.id, date: current } },
        create: { facilityId: facility.id, date: current, nextDate: next, note },
        update: { nextDate: next, note, closedAt: new Date() },
      });
    }
    return u.count;
  });
  if (updated === 0) return { ok: false, error: '営業日を進められませんでした。画面を開き直してください。' };
  revalidatePath('/', 'layout');
  return { ok: true, message: `${formatDateJa(current, true)} を締めました。営業日は ${formatDateJa(next, true)} です。` };
}

/** 営業日の修正（進めすぎたときなど、管理者向け） */
export async function setBusinessDateAction(_prev: DayResult, formData: FormData): Promise<DayResult> {
  const date = String(formData.get('date') ?? '');
  if (!isIsoDate(date)) return { ok: false, error: '日付を選んでください。' };
  const facility = await getCurrentFacility();
  await prisma.facility.update({ where: { id: facility.id }, data: { businessDate: date } });
  revalidatePath('/', 'layout');
  return { ok: true, message: `営業日を ${formatDateJa(date, true)} に変更しました。` };
}

/**
 * 取り込んだデータのリセット。予約・部屋割り・入金・預り金・取り込み履歴・レジ締め・ナイトオーディットの記録を消す。
 * 施設・客室マスタ（部屋タイプ名・故障の設定を含む）は残す。営業日は指定した日にする。
 */
export async function resetDataAction(_prev: DayResult, formData: FormData): Promise<DayResult> {
  if (String(formData.get('confirm') ?? '').trim() !== 'リセット') return { ok: false, error: '確認のため「リセット」と入力してください。' };
  const date = String(formData.get('date') ?? '');
  if (!isIsoDate(date)) return { ok: false, error: 'リセット後の営業日を選んでください。' };
  const facility = await getCurrentFacility();
  const counts = await prisma.$transaction(async (tx) => {
    const reservations = await tx.reservation.deleteMany({ where: { facilityId: facility.id } });
    await tx.importLog.deleteMany({ where: { facilityId: facility.id } });
    await tx.registerClose.deleteMany({ where: { facilityId: facility.id } });
    await tx.dayClose.deleteMany({ where: { facilityId: facility.id } });
    await tx.facility.update({ where: { id: facility.id }, data: { businessDate: date } });
    return reservations.count;
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: `予約 ${counts} 件と、入金・部屋割り・取り込み履歴・レジ締めの記録を削除しました。営業日は ${formatDateJa(date, true)} です。` };
}
