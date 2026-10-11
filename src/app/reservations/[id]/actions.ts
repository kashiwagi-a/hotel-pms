'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { yen } from '@/lib/format';
import { ADVANCE_METHOD, canCheckIn, canCheckOut, formatMethod, parsePaymentMethod, parseYen, splitAdvance, summarizeMoney } from '@/lib/settlement';
import { isCancelled } from '@/lib/indicator';

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
  return prisma.reservation.findFirst({
    where: { id, facilityId: facility.id },
    include: { payments: true, assignments: { include: { room: true } } },
  });
}

/** チェックイン精算：未収の宿泊料等と預り金を受け取り、チェックイン済みにする */
export async function checkinSettleAction(_prev: SettleResult, formData: FormData): Promise<SettleResult> {
  const id = Number(formData.get('reservationId'));
  const r = Number.isInteger(id) ? await loadReservation(id) : null;
  if (!r) return { ok: false, error: '予約が見つかりません。' };
  const bizDate = await getBusinessDate();

  // mode=pay：チェックイン後に残った未収だけを受け取る（料金の変更などで増えた分）
  const payOnly = formData.get('mode') === 'pay';
  if (payOnly) {
    if (!r.localCheckedInAt || r.localCheckedOutAt) return { ok: false, error: '滞在中の予約ではありません。' };
  } else {
    const check = canCheckIn(r, bizDate, r.assignments.length);
    if (!check.ok) return { ok: false, error: check.reason };
  }

  const money = summarizeMoney(r, r.payments);
  // 画面を開いている間に金額が変わっていたら、確認し直してもらう
  if (Number(formData.get('expectedDue')) !== money.remaining) {
    return { ok: false, error: '受け取る金額が変わっています。画面を開き直して確認してください。' };
  }
  const deposit = parseYen(formData.get('deposit'));
  if (deposit === null) return { ok: false, error: '預り金の金額を正しく入力してください。' };
  // 前受金を使うときは、宿泊料等に充当し、余りは預り金へ振り替える
  const useAdvance = formData.get('useAdvance') === '1' && money.advanceBalance > 0;
  if (useAdvance && Number(formData.get('expectedAdvance')) !== money.advanceBalance) {
    return { ok: false, error: '前受金の残高が変わっています。画面を開き直して確認してください。' };
  }
  const adv = useAdvance ? splitAdvance(money.advanceBalance, money.remaining) : { applied: 0, toDeposit: 0 };
  const due = money.remaining - adv.applied;
  const total = due + deposit;

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
      if (!payOnly) {
        // 二重登録を防ぐため、まだチェックインしていない場合だけ更新する
        const updated = await tx.reservation.updateMany({ where: { id, localCheckedInAt: null }, data: { localCheckedInAt: new Date() } });
        if (updated.count === 0) throw new AlreadyCheckedIn();
      }
      const transfer = { source: 'manual', method: ADVANCE_METHOD, brand: null, register: REGISTER, businessDate: bizDate };
      if (adv.applied > 0) {
        await tx.payment.create({ data: { reservationId: id, kind: 'payment', amount: adv.applied, ...transfer, note: '前受金から充当' } });
      }
      if (adv.toDeposit > 0) {
        await tx.payment.create({ data: { reservationId: id, kind: 'deposit', amount: adv.toDeposit, ...transfer, note: '前受金の余りを預り金へ振替' } });
      }
      if (method && due > 0) {
        await tx.payment.create({ data: { reservationId: id, kind: 'payment', source: 'manual', amount: due, ...method, register: REGISTER, businessDate: bizDate, note: payOnly ? '未収の精算' : 'チェックイン精算' } });
      }
      if (method && deposit > 0) {
        await tx.payment.create({ data: { reservationId: id, kind: 'deposit', source: 'manual', amount: deposit, ...method, register: REGISTER, businessDate: bizDate, note: 'チェックイン時の預り金' } });
      }
    });
  } catch (e) {
    if (e instanceof AlreadyCheckedIn) return { ok: false, error: 'すでにチェックイン済みです。' };
    throw e;
  }
  refresh(id);

  const rooms = r.assignments.map((a) => a.room.number).join('・');
  const parts = [payOnly ? `${rooms} ${r.guestName} 様の未収を精算しました。` : `${rooms} ${r.guestName} 様のチェックインを登録しました。`];
  if (adv.applied > 0) parts.push(`前受金から宿泊料等へ ${yen(adv.applied)} を充当しました。`);
  if (adv.toDeposit > 0) parts.push(`前受金の余り ${yen(adv.toDeposit)} を預り金へ振り替えました。`);
  if (method) {
    parts.push(`${formatMethod(method.method, method.brand)}で ${yen(total)} をお預かりしました（宿泊料等 ${yen(due)}・預り金 ${yen(deposit)}）。`);
    if (change > 0) parts.push(`お釣りは ${yen(change)} です。`);
  } else if (adv.applied + adv.toDeposit === 0) {
    parts.push('お支払いはありません。');
  }
  return { ok: true, message: parts.join('') };
}

/** 預り金の登録（チェックイン後の追加など） */
export async function depositAction(_prev: SettleResult, formData: FormData): Promise<SettleResult> {
  const id = Number(formData.get('reservationId'));
  const r = Number.isInteger(id) ? await loadReservation(id) : null;
  if (!r) return { ok: false, error: '予約が見つかりません。' };
  const bizDate = await getBusinessDate();
  if (isCancelled(r.status)) return { ok: false, error: '取消になった予約には登録できません。' };
  if (r.localCheckedOutAt) return { ok: false, error: 'チェックアウト済みの予約には登録できません。' };

  const amount = parseYen(formData.get('amount'));
  if (amount === null || amount <= 0) return { ok: false, error: '預り金の金額を入力してください。' };
  const pm = parsePaymentMethod(formData.get('method'), formData.get('brand'));
  if (!pm.ok) return { ok: false, error: pm.error };
  const note = String(formData.get('note') ?? '').trim().slice(0, 200) || null;

  await prisma.payment.create({
    data: { reservationId: id, kind: 'deposit', source: 'manual', amount, method: pm.method, brand: pm.brand, register: REGISTER, businessDate: bizDate, note },
  });
  refresh(id);
  const balance = summarizeMoney(r, r.payments).depositBalance + amount;
  return { ok: true, message: `${formatMethod(pm.method, pm.brand)}で預り金 ${yen(amount)} をお預かりしました。預り金残高は ${yen(balance)} です。` };
}

/**
 * チェックアウト：未収が無いことを確認し、預り金の残りを返金してチェックアウト済みにする。
 * 部屋付けの精算は次の版で対応するため、預り金は全額を返金する。
 */
export async function checkoutAction(_prev: SettleResult, formData: FormData): Promise<SettleResult> {
  const id = Number(formData.get('reservationId'));
  const r = Number.isInteger(id) ? await loadReservation(id) : null;
  if (!r) return { ok: false, error: '予約が見つかりません。' };
  const bizDate = await getBusinessDate();
  const check = canCheckOut(r);
  if (!check.ok) return { ok: false, error: check.reason };
  const money = summarizeMoney(r, r.payments);
  if (money.remaining > 0) return { ok: false, error: `未収 ${yen(money.remaining)} があります。先にチェックイン精算で受け取ってください。` };
  // 使わなかった前受金も、預り金と一緒に返金する
  const advanceLeft = Math.max(0, money.advanceBalance);
  const refundTotal = money.depositBalance + advanceLeft;
  if (Number(formData.get('expectedRefund')) !== refundTotal) {
    return { ok: false, error: '預り金・前受金の残高が変わっています。画面を開き直して確認してください。' };
  }
  let refund: { method: string; brand: string | null } | null = null;
  if (refundTotal > 0) {
    const pm = parsePaymentMethod(formData.get('method'), formData.get('brand'));
    if (!pm.ok) return { ok: false, error: `返金の${pm.error}` };
    refund = { method: pm.method, brand: pm.brand };
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.reservation.updateMany({ where: { id, localCheckedOutAt: null }, data: { localCheckedOutAt: new Date() } });
    if (u.count > 0 && refund && money.depositBalance > 0) {
      await tx.payment.create({
        data: { reservationId: id, kind: 'refund', source: 'manual', amount: money.depositBalance, ...refund, register: REGISTER, businessDate: bizDate, note: '預り金の返金（チェックアウト）' },
      });
    }
    if (u.count > 0 && refund && advanceLeft > 0) {
      await tx.payment.create({
        data: { reservationId: id, kind: 'advance_refund', source: 'manual', amount: advanceLeft, ...refund, register: REGISTER, businessDate: bizDate, note: '前受金の返金（チェックアウト）' },
      });
    }
    return u.count;
  });
  if (updated === 0) return { ok: false, error: 'すでにチェックアウト済みです。' };
  refresh(id);
  const rooms = r.assignments.map((a) => a.room.number).join('・');
  return {
    ok: true,
    message: `${rooms} ${r.guestName} 様のチェックアウトを登録しました。${refund ? `${advanceLeft > 0 ? '預り金・前受金' : '預り金'} ${yen(refundTotal)} を${formatMethod(refund.method, refund.brand)}で返金しました。` : ''}`,
  };
}

/** 前受金の登録：到着前（チェックイン前）に受け取ったお金を、予約に前もって割り当てておく */
export async function advanceAction(_prev: SettleResult, formData: FormData): Promise<SettleResult> {
  const id = Number(formData.get('reservationId'));
  const r = Number.isInteger(id) ? await loadReservation(id) : null;
  if (!r) return { ok: false, error: '予約が見つかりません。' };
  if (isCancelled(r.status)) return { ok: false, error: '取消になった予約には登録できません。' };
  if (r.localCheckedInAt) return { ok: false, error: 'チェックイン済みです。滞在中のお預かりは「預り金を登録」を使ってください。' };
  const bizDate = await getBusinessDate();

  const amount = parseYen(formData.get('amount'));
  if (amount === null || amount <= 0) return { ok: false, error: '前受金の金額を入力してください。' };
  const pm = parsePaymentMethod(formData.get('method'), formData.get('brand'), { allowTransfer: true });
  if (!pm.ok) return { ok: false, error: pm.error };
  const note = String(formData.get('note') ?? '').trim().slice(0, 200) || null;

  await prisma.payment.create({
    data: { reservationId: id, kind: 'advance', source: 'manual', amount, method: pm.method, brand: pm.brand, register: REGISTER, businessDate: bizDate, note },
  });
  refresh(id);
  const balance = summarizeMoney(r, r.payments).advanceBalance + amount;
  return { ok: true, message: `${formatMethod(pm.method, pm.brand)}で前受金 ${yen(amount)} を登録しました。前受金残高は ${yen(balance)} です。チェックイン時に宿泊料等へ充当できます。` };
}

/** 前受金の返金（取消や過入金のとき。チェックイン前のみ） */
export async function advanceRefundAction(_prev: SettleResult, formData: FormData): Promise<SettleResult> {
  const id = Number(formData.get('reservationId'));
  const r = Number.isInteger(id) ? await loadReservation(id) : null;
  if (!r) return { ok: false, error: '予約が見つかりません。' };
  if (r.localCheckedInAt) return { ok: false, error: 'チェックイン済みです。残りはチェックアウト時に返金します。' };
  const bizDate = await getBusinessDate();
  const balance = summarizeMoney(r, r.payments).advanceBalance;
  if (balance <= 0) return { ok: false, error: '前受金の残高がありません。' };
  const amount = parseYen(formData.get('amount'));
  if (amount === null || amount <= 0) return { ok: false, error: '返金する金額を入力してください。' };
  if (amount > balance) return { ok: false, error: `前受金の残高（${yen(balance)}）を超えています。` };
  const pm = parsePaymentMethod(formData.get('method'), formData.get('brand'), { allowTransfer: true });
  if (!pm.ok) return { ok: false, error: `返金の${pm.error}` };
  const note = String(formData.get('note') ?? '').trim().slice(0, 200) || '前受金の返金';

  await prisma.payment.create({
    data: { reservationId: id, kind: 'advance_refund', source: 'manual', amount, method: pm.method, brand: pm.brand, register: REGISTER, businessDate: bizDate, note },
  });
  refresh(id);
  return { ok: true, message: `前受金 ${yen(amount)} を${formatMethod(pm.method, pm.brand)}で返金しました。前受金残高は ${yen(balance - amount)} です。` };
}
