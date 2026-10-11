import type { PrismaClient } from '@prisma/client';
import { parseRakutsuCsv, type RakutsuRecord } from './rakutsu-csv';
import { buildingOf } from './rooms';

export type ImportWarning = { line: number; message: string };

export type ImportSummary = {
  fileName: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  roomsCreated: string[];
  unknownColumns: string[];
  warnings: ImportWarning[];
};

/**
 * 同じ予約かどうかを判定するキー。
 * 予約番号があればそれを使う（らく通では部屋ごとに (1)(2) や #1 #2 が付く）。
 * 予約番号が無い・途中で切れている行（臨時ステイなど）は、部屋・到着日・氏名で判定する。
 */
export function reservationKey(r: RakutsuRecord): string {
  if (r.bookingNo && !r.bookingNo.includes('…')) return `B:${r.bookingNo}`;
  return `X:${r.bookingNo ?? ''}|${r.roomNumber ?? ''}|${r.arrival ?? ''}|${r.guestName ?? ''}`;
}

export function floorOf(roomNumber: string): number {
  const n = Number.parseInt(roomNumber.replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return 1;
  return n >= 100 ? Math.floor(n / 100) : 1;
}

/** らく通「宿泊者一覧」CSV を取り込む。dryRun のときはデータベースを変更しない */
export async function importRakutsuCsv(
  prisma: PrismaClient,
  opts: { facilityId: number; text: string; fileName: string; dryRun?: boolean; markSample?: boolean },
): Promise<ImportSummary> {
  const { facilityId, fileName } = opts;
  const dryRun = !!opts.dryRun;
  const { records, unknownColumns } = parseRakutsuCsv(opts.text);
  const summary: ImportSummary = {
    fileName, dryRun, total: records.length, created: 0, updated: 0, skipped: 0,
    roomsCreated: [], unknownColumns, warnings: [],
  };
  const warn = (line: number, message: string) => summary.warnings.push({ line, message });

  const rooms = await prisma.room.findMany({ where: { facilityId } });
  const roomIdByNumber = new Map<string, number>(rooms.map((r) => [r.number, r.id]));
  const seen = new Set<string>();

  for (const rec of records) {
    if (!rec.guestName && !rec.roomNumber) {
      summary.skipped++;
      warn(rec.line, '部屋番号と宿泊者名が空のため取り込みませんでした。');
      continue;
    }
    if (!rec.guestName) {
      summary.skipped++;
      warn(rec.line, '宿泊者名が空のため取り込みませんでした。');
      continue;
    }
    const key = reservationKey(rec);
    if (seen.has(key)) {
      summary.skipped++;
      warn(rec.line, '同じ予約が CSV の中に重複しているため、2 件目以降を取り込みませんでした。');
      continue;
    }
    seen.add(key);
    if (rec.truncatedFields.length > 0) {
      warn(rec.line, `途中で切れている項目があります（${rec.truncatedFields.join('、')}）。らく通から出力した元の CSV で取り込み直してください。`);
    }
    if (!rec.arrival || !rec.departure) {
      warn(rec.line, '到着日・出発日が空のため、インジケーターには表示されません。');
    }
    if (!rec.status) {
      warn(rec.line, 'ステータスが空のため「不明」として取り込みました。');
    }

    let roomId: number | null = null;
    if (rec.roomNumber) {
      const found = roomIdByNumber.get(rec.roomNumber);
      if (found !== undefined) {
        roomId = found;
      } else if (!summary.roomsCreated.includes(rec.roomNumber)) {
        summary.roomsCreated.push(rec.roomNumber);
        if (!dryRun) {
          const room = await prisma.room.create({
            data: { facilityId, number: rec.roomNumber, floor: floorOf(rec.roomNumber), type: rec.roomType ?? '未設定', building: buildingOf(floorOf(rec.roomNumber)) },
          });
          roomIdByNumber.set(room.number, room.id);
          roomId = room.id;
        }
      }
    }

    const data = {
      bookingNo: rec.bookingNo,
      roomId,
      roomNumber: rec.roomNumber,
      roomType: rec.roomType,
      arrival: rec.arrival,
      departure: rec.departure,
      nights: rec.nights,
      guestName: rec.guestName,
      phone: rec.phone,
      pax: rec.pax,
      groupCode: rec.groupCode,
      status: rec.status ?? '不明',
      checkedInAt: rec.checkedInAt,
      channel: rec.channel,
      mealPlan: rec.mealPlan,
      settlement: rec.settlement,
      pricePerNight: rec.pricePerNight,
      couponPoints: rec.couponPoints ?? 0,
      totalAmount: rec.totalAmount ?? 0,
      extraFee: rec.extraFee ?? 0,
      extraDetail: rec.extraDetail,
      billed: rec.billed ?? 0,
      received: rec.received ?? 0,
      unpaid: rec.unpaid ?? 0,
      receiptsRaw: rec.receiptsRaw,
      planName: rec.planName,
      frontNote: rec.frontNote,
      sourceCreatedAt: rec.sourceCreatedAt,
      sourceCreatedBy: rec.sourceCreatedBy,
      sourceUpdatedAt: rec.sourceUpdatedAt,
      sourceUpdatedBy: rec.sourceUpdatedBy,
      isSample: !!opts.markSample,
    };

    const where = { facilityId_externalKey: { facilityId, externalKey: key } };
    const existing = await prisma.reservation.findUnique({ where, select: { id: true } });
    if (dryRun) {
      if (existing) summary.updated++;
      else summary.created++;
      continue;
    }

    const saved = await prisma.reservation.upsert({
      where,
      create: { facilityId, externalKey: key, ...data },
      update: data,
    });
    // らく通から取り込んだ入金は毎回入れ替える（この画面で登録した入金・預り金は残す）
    await prisma.payment.deleteMany({ where: { reservationId: saved.id, source: 'import' } });
    if (rec.receipts.length > 0) {
      await prisma.payment.createMany({
        data: rec.receipts.map((p) => ({
          reservationId: saved.id, kind: 'payment', source: 'import',
          amount: p.amount, method: p.method, brand: p.brand, register: p.register, raw: p.raw,
        })),
      });
    }
    if (existing) summary.updated++;
    else summary.created++;
  }

  if (!dryRun) {
    await prisma.importLog.create({
      data: {
        facilityId, fileName, total: summary.total, created: summary.created, updated: summary.updated,
        skipped: summary.skipped, warnings: JSON.stringify(summary.warnings),
      },
    });
  }
  return summary;
}
