/**
 * 初期データ
 * - 施設 1 件と客室マスタ（2F 禁煙シングル 201〜216、3F 加熱式シングル 301〜312）
 * - 架空の宿泊者で作ったサンプル予約（data/sample/rakutsu-sample.csv）
 * 実在のお客様のデータは含めない。本番データは画面の「らく通 CSV 取込」から取り込む。
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importRakutsuCsv, floorOf } from '../src/lib/import-rakutsu';

const prisma = new PrismaClient();

function range(from: number, to: number, type: string) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ number: String(from + i), type }));
}

async function main() {
  const facility = await prisma.facility.upsert({
    where: { name: '古河駅前' },
    update: {},
    create: { name: '古河駅前' },
  });

  const rooms = [...range(201, 216, '禁煙シングル'), ...range(301, 312, '加熱式シングル')];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { facilityId_number: { facilityId: facility.id, number: r.number } },
      update: {},
      create: { facilityId: facility.id, number: r.number, floor: floorOf(r.number), type: r.type },
    });
  }
  // 故障の表示を確認できるよう 1 室を使用停止にする
  await prisma.room.update({
    where: { facilityId_number: { facilityId: facility.id, number: '312' } },
    data: { outOfOrder: true },
  });

  const text = readFileSync(join(__dirname, '../data/sample/rakutsu-sample.csv'), 'utf8');
  const summary = await importRakutsuCsv(prisma, {
    facilityId: facility.id, text, fileName: 'rakutsu-sample.csv', markSample: true,
  });
  console.log(`施設「${facility.name}」客室 ${rooms.length} 室、サンプル予約 新規 ${summary.created} 件・更新 ${summary.updated} 件を登録しました。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
