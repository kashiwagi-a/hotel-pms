import { prisma } from './db';

/**
 * 操作対象の施設。現在は最初に登録された施設を使う。
 * 複数施設の切り替えは、画面上部の施設セレクタを実装するときにここを差し替える。
 */
export async function getCurrentFacility() {
  const facility = await prisma.facility.findFirst({ orderBy: { id: 'asc' } });
  if (facility) return facility;
  return prisma.facility.create({ data: { name: 'メイン施設' } });
}
