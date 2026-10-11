'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { todayJst } from '@/lib/dates';
import { yen } from '@/lib/format';
import { canCheckIn, formatMethod, parsePaymentMethod, parseYen, summarizeMoney } from '@/lib/settlement';

export type SettleResult = { ok: true; message: string } | { ok: false; error: string } | null;

const REGISTER = 'フロント（宿泊管理）';

class AlreadyCheckedIn extends Error {}

function refresh(id: number) {
  revalidatePath(`/reservations/${id}`);
  revalidatePath('/reservations');
  revalidatePath('/indicator');
}

async function loadReservation(id: number) {
  const facility = await getCurrentFacility();
  return prisma.reservation.findFirst({ where: { id, facilityId: facility.id }, include: { payments: true } });
}

/** チェックイン精算：未収の宿泊料等と預り金を受け取り、チェックイン済みにする */
export async function checkinSettleAction(_prev: SettleResult, formData: FormData): Promise<SettleResult> {
  const id = Number(formData.get('reservationId'));
  const r = Number.isInteger(id) ? await loadReservation(id) : null;
  if (!r) return { ok: false, error: '予約が見つかりません。' };

  const check = canCheckIn(r, todayJst());
  if (!check.ok) return { ok: false, error: check.reason };

  const money = summarizeMoney(r, r.payments);
  // 画面を開いている間に金額が変わっていたら、確認し直してもらう
  if (Number(formData.get('expectedDue')) !== money.remaining) {
    return { ok: false, error: '受け取る金額が変わっています。画面を開き直して確認してください。' };
  }
  const deposit = parseYen(formData.get('deposit'));
  if (deposit === null) return { ok: false, error: '預り金の金額を正しく入力してください。' };
  const total = money.remaining + deposit;

  let method: { method: string; brand: string | null } | null = null;
  let change = 0;
  if (total > 0) {
    const pm = parsePaymentMethod(formData.get('method'), formData.get('brand'));
    if (!pm.ok) return { ok: false, error: pm.error };
    if (pm.isCash) {
      const tendered = parseYen(formData.get('tendered'));
      if (tendered === null || tendered < total) return { ok: false, error: 'お預り金額が不足しています。' };
      change = tendered - total;
    }
    method = { method: pm.method, brand: pm.brand };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 二重登録を防ぐため、まだチェックインしていない場合だけ更新する
      const updated = await tx.reservation.updateMany({ where: { id, localCheckedInAt: null }, data: { localCheckedInAt: new Date() } });
      if (updated.count === 0) throw new AlreadyCheckedIn();
      if (method && money.remaining > 0) {
        await tx.payment.create({ data: { reservationId: id, kind: 'payment', source: 'manual', amount: money.remaining, ...method, register: REGISTER, note: 'チェックイン精算' } });
      }
      if (method && deposit > 0) {
        await tx.payment.create({ data: { reservationId: id, kind: 'deposit', source: 'manual', amount: deposit, ...method, register: REGISTER, note: 'チェックイン時の預り金' } });
      }
    });
  } catch (e) {
    if (e instanceof AlreadyCheckedIn) return { ok: false, error: 'すでにチェックイン済みです。' };
    throw e;
  }
  refresh(id);

  const parts = [`${r.roomNumber ?? ''} ${r.guestName} 様のチェックインを登録しました。`];
  if (method) {
    parts.push(`${formatMethod(method.method, method.brand)}で ${yen(total)} をお預かりしました（宿泊料等 ${yen(money.remaining)}・預り金 ${yen(deposit)}）。`);
    if (change > 0) parts.push(`お釣りは ${yen(change)} です。`);
  } else {
    parts.push('お支払いはありません。');
  }
  return { ok: true, message: parts.join('') };
}

/** 預り金の登録（チェックイン後の追加など） */
export async function depositAction(_prev: SettleResult, formData: FormData): Promise<SettleResult> {
  const id = Number(formData.get('reservationId'));
  const r = Number.isInteger(id) ? await loadReservation(id) : null;
  if (!r) return { ok: false, error: '予約が見つかりません。' };
  if (/キャンセル|取消|ノーショー/.test(r.status)) return { ok: false, error: 'キャンセルされた予約には登録できません。' };

  const amount = parseYen(formData.get('amount'));
  if (amount === null || amount <= 0) return { ok: false, error: '預り金の金額を入力してください。' };
  const pm = parsePaymentMethod(formData.get('method'), formData.get('brand'));
  if (!pm.ok) return { ok: false, error: pm.error };
  const note = String(formData.get('note') ?? '').trim().slice(0, 200) || null;

  await prisma.payment.create({
    data: { reservationId: id, kind: 'deposit', source: 'manual', amount, method: pm.method, brand: pm.brand, register: REGISTER, note },
  });
  refresh(id);
  const balance = summarizeMoney(r, r.payments).depositBalance + amount;
  return { ok: true, message: `${formatMethod(pm.method, pm.brand)}で預り金 ${yen(amount)} をお預かりしました。預り金残高は ${yen(balance)} です。` };
}
