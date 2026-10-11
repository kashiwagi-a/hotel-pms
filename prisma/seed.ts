/**
 * 初期データ
 *
 * ふつうは data/rooms/*.csv の客室マスタから、施設と客室だけを登録する（予約は入れない）。
 * 既にある部屋は変更しないので、何度実行してもよい。
 *
 * SEED_SAMPLE=1 のとき（または客室マスタの CSV が無いとき）は、動作確認用の架空データを入れる：
 * - 施設 1 件と客室マスタ（2F 禁煙シングル 201〜216、3F 加熱式たばこ専用シングル 301〜312、4F 禁煙ツイン 401〜404）
 * - 架空のお客様で作ったサンプル予約（data/sample/rakutsu-sample.csv。らく通「予約一覧」と同じ形式）
 * - 10/12 より前にチェックインした予約は、部屋を割り当ててチェックイン済みにする
 * 実在のお客様のデータは含めない。本番データは画面の「らく通 CSV 取込」から取り込む。
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importRakutsuCsv, floorOf } from '../src/lib/import-rakutsu';
import { buildingOf } from '../src/lib/rooms';
import { planAutoAssign } from '../src/lib/assignment';
import { parseRoomMaster } from '../src/lib/room-master';
import { todayJst } from '../src/lib/dates';

const prisma = new PrismaClient();
const SAMPLE_DATE = '2026-10-12';

function range(from: number, to: number, type: string, typeCode: string, capacity: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ number: String(from + i), type, typeCode, capacity }));
}

/** data/rooms/*.csv の客室マスタを登録する。CSV が無ければ false */
async function seedRoomMaster(): Promise<boolean> {
  const dir = join(__dirname, '../data/rooms');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.csv')).sort() : [];
  if (files.length === 0) return false;
  for (const file of files) {
    const rows = parseRoomMaster(readFileSync(join(dir, file), 'utf8'));
    const byFacility = new Map<string, typeof rows>();
    for (const r of rows) byFacility.set(r.facility, [...(byFacility.get(r.facility) ?? []), r]);
    for (const [name, list] of byFacility) {
      const facility = await prisma.facility.upsert({ where: { name }, update: {}, create: { name, businessDate: todayJst() } });
      let created = 0;
      for (const r of list) {
        const exists = await prisma.room.findUnique({ where: { facilityId_number: { facilityId: facility.id, number: r.number } } });
        if (exists) continue;
        await prisma.room.create({
          data: { facilityId: facility.id, number: r.number, floor: r.floor, building: r.building ?? buildingOf(r.floor), type: r.type, typeCode: r.typeCode, capacity: r.capacity },
        });
        created++;
      }
      console.log(`施設「${name}」：客室マスタ ${list.length} 室のうち ${created} 室を新しく登録しました（${file}）。`);
    }
  }
  return true;
}

async function main() {
  if (process.env.SEED_SAMPLE !== '1' && (await seedRoomMaster())) return;
  await seedSample();
}

/** 動作確認用の架空データ */
async function seedSample() {
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
