'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { addDays, isIsoDate } from '@/lib/dates';
import { yen } from '@/lib/format';
import { parseYen } from '@/lib/settlement';
import { expectedCash, parseDenominations, paymentDateWhere, totalOfDenominations } from '@/lib/accounting';

export type CloseResult = { ok: true; message: string } | { ok: false; error: string } | null;

/** レジ締め：理論在高はサーバーで計算し直してから保存する */
export async function closeRegisterAction(_prev: CloseResult, formData: FormData): Promise<CloseResult> {
  const date = String(formData.get('date') ?? '');
  if (!isIsoDate(date)) return { ok: false, error: '日付が正しくありません。' };
  const floatAmount = parseYen(formData.get('floatAmount'));
  const counted = parseYen(formData.get('countedCash'));
  if (floatAmount === null) return { ok: false, error: '釣銭準備金を正しく入力してください。' };
  if (counted === null || String(formData.get('countedCash') ?? '').trim() === '') return { ok: false, error: '数えた現金の金額を入力してください。' };
  const note = String(formData.get('note') ?? '').trim().slice(0, 200) || null;
  // 金種で数えたときは、枚数から合計を計算し直して確かめる
  const denomRaw = String(formData.get('denominations') ?? '');
  const denoms = denomRaw ? parseDenominations(denomRaw) : null;
  if (denomRaw && !denoms) return { ok: false, error: '金種の枚数を読み取れませんでした。' };
  if (denoms && totalOfDenominations(denoms) !== counted) return { ok: false, error: '金種の合計と実査の金額が一致しません。画面を開き直してください。' };

  const facility = await getCurrentFacility();
  const rows = await prisma.payment.findMany({ where: { reservation: { facilityId: facility.id }, ...paymentDateWhere(date, addDays(date, 1)) } });
  const expected = expectedCash(rows, floatAmount);
  const diff = counted - expected;
  try {
    await prisma.registerClose.create({ data: { facilityId: facility.id, date, floatAmount, expectedCash: expected, countedCash: counted, diff, note, denominations: denoms ? JSON.stringify(denoms) : null } });
  } catch (e) {
    // 同じ日の締めが既にある（一意制約）ときだけ案内し、それ以外のエラーは隠さない
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, error: 'この日はすでにレジ締めが済んでいます。' };
    throw e;
  }
  revalidatePath('/accounting');
  return { ok: true, message: `レジ締めを登録しました。理論在高 ${yen(expected)}・実査 ${yen(counted)}・過不足 ${diff === 0 ? 'なし' : `${diff > 0 ? '+' : ''}${yen(diff)}`}。` };
}

/** レジ締めの取り消し（数え間違いの修正用） */
export async function reopenRegisterAction(formData: FormData) {
  const date = String(formData.get('date') ?? '');
  if (!isIsoDate(date)) return;
  const facility = await getCurrentFacility();
  await prisma.registerClose.deleteMany({ where: { facilityId: facility.id, date } });
  revalidatePath('/accounting');
}
