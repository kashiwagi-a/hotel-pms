import { prisma } from './db';
import { todayJst } from './dates';

/**
 * 操作対象の施設。現在は最初に登録された施設を使う。
 * 複数施設の切り替えは、画面上部の施設セレクタを実装するときにここを差し替える。
 */
export async function getCurrentFacility() {
  const facility = await prisma.facility.findFirst({ orderBy: { id: 'asc' } });
  if (facility) return facility;
  return prisma.facility.create({ data: { name: 'メイン施設', businessDate: todayJst() } });
}

/**
 * 営業日（YYYY-MM-DD）。カレンダーの日付ではなく、フロントがナイトオーディットで翌日へ進める。
 * まだ決まっていない施設は、初めて使うときに今日の日付で始める。
 */
export async function getBusinessDate(): Promise<string> {
  const facility = await getCurrentFacility();
  if (facility.businessDate) return facility.businessDate;
  const today = todayJst();
  await prisma.facility.update({ where: { id: facility.id }, data: { businessDate: today } });
  return today;
}
