/**
 * 初期データ（動作確認用）
 * - 施設 1 件と客室マスタ（2F 禁煙シングル 201〜216、3F 加熱式たばこ専用シングル 301〜312、4F 禁煙ツイン 401〜404）
 * - 架空のお客様で作ったサンプル予約（data/sample/rakutsu-sample.csv。らく通「予約一覧」と同じ形式）
 * - 10/12 より前にチェックインした予約は、部屋を割り当ててチェックイン済みにする
 * 実在のお客様のデータは含めない。本番データは画面の「らく通 CSV 取込」から取り込む。
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importRakutsuCsv, floorOf } from '../src/lib/import-rakutsu';
import { buildingOf } from '../src/lib/rooms';
import { planAutoAssign } from '../src/lib/assignment';

const prisma = new PrismaClient();
const SAMPLE_DATE = '2026-10-12';

function range(from: number, to: number, type: string, typeCode: string, capacity: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ number: String(from + i), type, typeCode, capacity }));
}

async function main() {
  const facility = await prisma.facility.upsert({ where: { name: '古河駅前' }, update: { businessDate: SAMPLE_DATE }, create: { name: '古河駅前', businessDate: SAMPLE_DATE } });

  const rooms = [
    ...range(201, 216, '禁煙シングル', 'NS', 1),
    ...range(301, 312, '加熱式たばこ専用シングル', 'ZS', 1),
    ...range(401, 404, '禁煙ツイン', 'NT', 2),
  ];
  for (const r of rooms) {
    const floor = floorOf(r.number);
    await prisma.room.upsert({
      where: { facilityId_number: { facilityId: facility.id, number: r.number } },
      update: {},
      create: { facilityId: facility.id, number: r.number, floor, building: buildingOf(floor), type: r.type, typeCode: r.typeCode, capacity: r.capacity },
    });
  }

  const text = readFileSync(join(__dirname, '../data/sample/rakutsu-sample.csv'), 'utf8');
  const summary = await importRakutsuCsv(prisma, { facilityId: facility.id, text, fileName: 'rakutsu-sample.csv', markSample: true });

  // すでに泊まっている予約（チェックイン日がサンプルの日付より前）に部屋を割り当て、チェックイン済みにする
  const inHouse = await prisma.reservation.findMany({
    where: { facilityId: facility.id, isSample: true, arrival: { lt: SAMPLE_DATE }, status: { not: '取消' } },
    include: { _count: { select: { assignments: true } } },
  });
  const allRooms = await prisma.room.findMany({ where: { facilityId: facility.id } });
  const plan = planAutoAssign(
    inHouse.map((r) => ({ ...r, arrival: r.arrival!, departure: r.departure!, assigned: r._count.assignments })),
    allRooms,
    [],
  );
  await prisma.roomAssignment.createMany({ data: plan });
  for (const r of inHouse) {
    const at = new Date(`${r.arrival}T16:00:00+09:00`);
    await prisma.reservation.update({ where: { id: r.id }, data: { localCheckedInAt: at } });
    // 現地決済の予約は、チェックイン時に現金で受け取った扱いにする
    if (r.billed > 0) {
      await prisma.payment.create({ data: { reservationId: r.id, kind: 'payment', source: 'manual', amount: r.billed, method: '現金', register: 'サンプル', note: 'チェックイン精算', businessDate: r.arrival, createdAt: at } });
    }
  }
  console.log(`施設「${facility.name}」客室 ${rooms.length} 室、サンプル予約 新規 ${summary.created} 件（うち滞在中 ${inHouse.length} 件）を登録しました。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
