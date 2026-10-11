'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { addDays, isIsoDate } from '@/lib/dates';
import { yen } from '@/lib/format';
import { isCancelled } from '@/lib/indicator';
import { freeRoomsFor, planAutoAssign } from '@/lib/assignment';
import { formatMethod, parsePaymentMethod, parseYen } from '@/lib/settlement';
import { NEW_BOOKING_SETTLEMENTS, MAX_NEW_BOOKING_NIGHTS } from '@/lib/new-booking';

export type AssignResult = { ok: true; message: string } | { ok: false; error: string };

function refresh() {
  revalidatePath('/indicator');
  revalidatePath('/reservations', 'layout');
}

/** 期間が重なる部屋割りと、期間の初日にチェックアウトする部屋割り（同じ日の入れ替えの判定用）をまとめて読む */
async function assignmentsOverlapping(facilityId: number, arrival: string, departure: string) {
  return prisma.roomAssignment.findMany({
    where: { room: { facilityId }, reservation: { arrival: { lt: departure }, departure: { gte: arrival } } },
    include: { reservation: true },
  });
}

/** 予約に部屋を 1 室割り当てる */
export async function assignRoomAction(reservationId: number, roomId: number): Promise<AssignResult> {
  if (!Number.isInteger(reservationId) || !Number.isInteger(roomId)) return { ok: false, error: '指定が正しくありません。' };
  const facility = await getCurrentFacility();
  const [r, room] = await Promise.all([
    prisma.reservation.findFirst({ where: { id: reservationId, facilityId: facility.id }, include: { assignments: true } }),
    prisma.room.findFirst({ where: { id: roomId, facilityId: facility.id } }),
  ]);
  if (!r || !room) return { ok: false, error: '予約または部屋が見つかりません。' };
  if (!r.arrival || !r.departure) return { ok: false, error: 'チェックイン日・チェックアウト日が分からない予約です。' };
  if (isCancelled(r.status)) return { ok: false, error: '取消になった予約には部屋を割り当てられません。' };
  if (r.localCheckedOutAt) return { ok: false, error: 'チェックアウト済みの予約です。' };
  if (r.assignments.length >= r.roomCount) return { ok: false, error: `この予約は ${r.roomCount} 室すべての部屋割りが済んでいます。` };
  if (r.assignments.some((a) => a.roomId === roomId)) return { ok: false, error: 'すでにこの部屋を割り当てています。' };
  if (room.outOfOrder) return { ok: false, error: `${room.number} 号室は故障・使用停止中です。` };

  const booking = { ...r, arrival: r.arrival, departure: r.departure };
  const others = await assignmentsOverlapping(facility.id, r.arrival, r.departure);
  const free = freeRoomsFor(booking, [room], others.map((a) => ({ roomId: a.roomId, reservation: { ...a.reservation, arrival: a.reservation.arrival!, departure: a.reservation.departure! } })));
  if (free.length === 0) {
    const who = others.find((a) => a.roomId === roomId && !isCancelled(a.reservation.status));
    return { ok: false, error: `${room.number} 号室はその期間に${who ? `「${who.reservation.guestName} 様」の` : 'ほかの'}予約が入っています。` };
  }
  await prisma.roomAssignment.create({ data: { reservationId, roomId } });
  refresh();
  const done = r.assignments.length + 1;
  return { ok: true, message: `${r.guestName} 様に ${room.number} 号室を割り当てました（${done} / ${r.roomCount} 室）。` };
}

/** 部屋割りを外す（チェックイン済みの予約は外さない） */
export async function unassignRoomAction(reservationId: number, roomId: number): Promise<AssignResult> {
  if (!Number.isInteger(reservationId) || !Number.isInteger(roomId)) return { ok: false, error: '指定が正しくありません。' };
  const facility = await getCurrentFacility();
  const a = await prisma.roomAssignment.findFirst({
    where: { reservationId, roomId, reservation: { facilityId: facility.id } },
    include: { reservation: true, room: true },
  });
  if (!a) return { ok: false, error: '部屋割りが見つかりません。' };
  if (a.reservation.localCheckedInAt && !a.reservation.localCheckedOutAt) {
    return { ok: false, error: 'チェックイン済みのため外せません。部屋を移る機能は次の版で対応します。' };
  }
  await prisma.roomAssignment.delete({ where: { id: a.id } });
  refresh();
  return { ok: true, message: `${a.reservation.guestName} 様の ${a.room.number} 号室の割り当てを外しました。` };
}

/** その日に泊まる予約のうち、部屋割りが済んでいないものを自動で割り当てる */
export async function autoAssignAction(date: string): Promise<AssignResult> {
  if (!isIsoDate(date)) return { ok: false, error: '日付が正しくありません。' };
  const facility = await getCurrentFacility();
  const bookings = (await prisma.reservation.findMany({
    where: { facilityId: facility.id, arrival: { lte: date }, departure: { gt: date }, localCheckedOutAt: null },
    include: { _count: { select: { assignments: true } } },
  })).filter((r) => !isCancelled(r.status) && r._count.assignments < r.roomCount && r.arrival && r.departure);
  if (bookings.length === 0) return { ok: true, message: '部屋割りが必要な予約はありません。' };

  const minArr = bookings.reduce((m, b) => (b.arrival! < m ? b.arrival! : m), bookings[0].arrival!);
  const maxDep = bookings.reduce((m, b) => (b.departure! > m ? b.departure! : m), bookings[0].departure!);
  const [rooms, assignments] = await Promise.all([
    prisma.room.findMany({ where: { facilityId: facility.id } }),
    assignmentsOverlapping(facility.id, minArr, maxDep),
  ]);
  const plan = planAutoAssign(
    bookings.map((b) => ({ ...b, arrival: b.arrival!, departure: b.departure!, assigned: b._count.assignments })),
    rooms,
    assignments.map((a) => ({ roomId: a.roomId, reservation: { ...a.reservation, arrival: a.reservation.arrival!, departure: a.reservation.departure! } })),
  );
  if (plan.length > 0) await prisma.roomAssignment.createMany({ data: plan });
  refresh();
  const done = new Set(plan.map((p) => p.reservationId));
  const left = bookings.filter((b) => !done.has(b.id)).length;
  return {
    ok: true,
    message: `${done.size} 件の予約に ${plan.length} 室を割り当てました。${left ? `タイプの合う空室が足りないため、${left} 件は残っています。` : ''}`,
  };
}

export type CreateBookingResult =
  | { ok: true; message: string; reservationId: number; canCheckinNow: boolean }
  | { ok: false; error: string }
  | null;

const REGISTER = 'フロント（宿泊管理）';

/**
 * インジケーターで部屋をクリックして予約を作る（電話・飛び込みなど、らく通を通らない予約）。
 * 作った予約にはその部屋を割り当て、前受金があれば一緒に登録する。
 */
export async function createBookingAction(_prev: CreateBookingResult, formData: FormData): Promise<CreateBookingResult> {
  const roomId = Number(formData.get('roomId'));
  const arrival = String(formData.get('arrival') ?? '');
  const nights = Number(formData.get('nights'));
  const guestName = String(formData.get('guestName') ?? '').normalize('NFKC').trim().slice(0, 100);
  const phone = String(formData.get('phone') ?? '').normalize('NFKC').trim().slice(0, 30) || null;
  const pax = Number(formData.get('pax'));
  const planName = String(formData.get('planName') ?? '').trim().slice(0, 100) || null;
  const channel = String(formData.get('channel') ?? '').trim().slice(0, 50) || '直接（フロント）';
  const memo = String(formData.get('memo') ?? '').trim().slice(0, 500) || null;
  const settlement = String(formData.get('settlement') ?? '');
  const totalAmount = parseYen(formData.get('totalAmount'));
  const advance = parseYen(formData.get('advance'));

  if (!Number.isInteger(roomId)) return { ok: false, error: '部屋の指定が正しくありません。' };
  if (!isIsoDate(arrival)) return { ok: false, error: 'チェックイン日が正しくありません。' };
  if (!Number.isInteger(nights) || nights < 1 || nights > MAX_NEW_BOOKING_NIGHTS) return { ok: false, error: `泊数は 1〜${MAX_NEW_BOOKING_NIGHTS} 泊で入力してください。` };
  if (!guestName) return { ok: false, error: 'お客様名を入力してください。' };
  if (!Number.isInteger(pax) || pax < 1 || pax > 50) return { ok: false, error: '人数を正しく入力してください。' };
  if (totalAmount === null) return { ok: false, error: '宿泊料金を正しく入力してください。' };
  if (advance === null) return { ok: false, error: '前受金の金額を正しく入力してください。' };
  const settle = NEW_BOOKING_SETTLEMENTS.find((x) => x.value === settlement);
  if (!settle) return { ok: false, error: '決済方法を選択してください。' };
  let advanceMethod: { method: string; brand: string | null } | null = null;
  if (advance > 0) {
    const pm = parsePaymentMethod(formData.get('method'), formData.get('brand'), { allowTransfer: true });
    if (!pm.ok) return { ok: false, error: `前受金の${pm.error}` };
    advanceMethod = { method: pm.method, brand: pm.brand };
  }

  const facility = await getCurrentFacility();
  const bizDate = await getBusinessDate();
  if (arrival < bizDate) return { ok: false, error: '営業日より前の日付には予約を作れません。' };
  const departure = addDays(arrival, nights);
  const room = await prisma.room.findFirst({ where: { id: roomId, facilityId: facility.id } });
  if (!room) return { ok: false, error: '部屋が見つかりません。' };
  if (room.outOfOrder) return { ok: false, error: `${room.number} 号室は故障・使用停止中です。` };

  const booking = { id: 0, status: '予約', arrival, departure, roomTypeCode: room.typeCode };
  const others = await assignmentsOverlapping(facility.id, arrival, departure);
  const busy = others.map((a) => ({ roomId: a.roomId, reservation: { ...a.reservation, arrival: a.reservation.arrival!, departure: a.reservation.departure! } }));
  if (freeRoomsFor(booking, [room], busy).length === 0) {
    const who = others.find((a) => a.roomId === roomId && !isCancelled(a.reservation.status));
    return { ok: false, error: `${room.number} 号室はその期間に${who ? `「${who.reservation.guestName} 様」の` : 'ほかの'}予約が入っています。泊数を減らすか、別の部屋を選んでください。` };
  }

  const billed = settle.onSite ? totalAmount : 0;
  const created = await prisma.$transaction(async (tx) => {
    const r = await tx.reservation.create({
      data: {
        facilityId: facility.id,
        // らく通の取り込み（B: / X:）と重ならないキー
        externalKey: `M:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        status: '予約',
        arrival, departure, nights, pax, roomCount: 1,
        roomTypeCode: room.typeCode, roomType: room.type,
        planName, channel, guestName, phone,
        settlement: settle.value, totalAmount, billed, memo,
        bookedAt: new Date(),
      },
    });
    await tx.roomAssignment.create({ data: { reservationId: r.id, roomId } });
    if (advanceMethod && advance > 0) {
      await tx.payment.create({
        data: { reservationId: r.id, kind: 'advance', source: 'manual', amount: advance, ...advanceMethod, register: REGISTER, businessDate: bizDate, note: '予約作成時の前受金' },
      });
    }
    return r;
  });
  refresh();
  revalidatePath('/dashboard');

  const parts = [`${guestName} 様の予約を作成し、${room.number} 号室を割り当てました（${arrival} から ${nights} 泊）。`];
  if (advanceMethod && advance > 0) parts.push(`前受金 ${yen(advance)}（${formatMethod(advanceMethod.method, advanceMethod.brand)}）を登録しました。`);
  return { ok: true, message: parts.join(''), reservationId: created.id, canCheckinNow: arrival === bizDate };
}
