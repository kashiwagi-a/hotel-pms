import type { PrismaClient } from '@prisma/client';
import { parseRakutsuCsv, requiresOnSitePayment, type RakutsuRecord } from './rakutsu-csv';
import { isCancelled } from './indicator';

export type ImportWarning = { line: number; message: string };

export type ImportSummary = {
  fileName: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  /** CSV にあった取消の行の数（取り込まない） */
  cancelled: number;
  /** 取消になったため削除した、取り込み済みの予約の数 */
  cancelRemoved: number;
  /** 取消になったが、チェックイン済み・入金ありのため残した予約の数 */
  cancelKept: number;
  /** 電話番号が指数表記で読めなかった行の数 */
  phoneBroken: number;
  unknownColumns: string[];
  warnings: ImportWarning[];
};

/**
 * 同じ予約かどうかを判定するキー。予約番号があればそれを使う。
 * 予約番号が無い行は、お客様名・チェックイン日・室タイプで判定する。
 */
export function reservationKey(r: RakutsuRecord): string {
  if (r.bookingNo) return `B:${r.bookingNo}`;
  return `X:${r.guestName ?? ''}|${r.arrival ?? ''}|${r.roomTypeRaw ?? ''}`;
}

export function floorOf(roomNumber: string): number {
  const n = Number.parseInt(roomNumber.replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return 1;
  return n >= 100 ? Math.floor(n / 100) : 1;
}

/** らく通「予約一覧」CSV を取り込む。dryRun のときはデータベースを変更しない */
export async function importRakutsuCsv(
  prisma: PrismaClient,
  opts: { facilityId: number; text: string; fileName: string; dryRun?: boolean; markSample?: boolean },
): Promise<ImportSummary> {
  const { facilityId, fileName } = opts;
  const dryRun = !!opts.dryRun;
  const { records, unknownColumns } = parseRakutsuCsv(opts.text);
  const summary: ImportSummary = {
    fileName, dryRun, total: records.length, created: 0, updated: 0, skipped: 0, cancelled: 0,
    cancelRemoved: 0, cancelKept: 0, phoneBroken: 0, unknownColumns, warnings: [],
  };
  const warn = (line: number, message: string) => summary.warnings.push({ line, message });
  const seen = new Set<string>();

  for (const rec of records) {
    if (!rec.status || !rec.arrival || !rec.departure || !rec.guestName) {
      summary.skipped++;
      const lack = [!rec.status && '区分', !rec.arrival && 'チェックイン', !rec.departure && 'チェックアウト', !rec.guestName && 'お客様名'].filter(Boolean);
      warn(rec.line, `${lack.join('・')}が空のため取り込みませんでした。`);
      continue;
    }
    if (rec.departure <= rec.arrival) {
      summary.skipped++;
      warn(rec.line, 'チェックアウトがチェックイン以前の日付のため取り込みませんでした。');
      continue;
    }
    const key = reservationKey(rec);
    if (seen.has(key)) {
      summary.skipped++;
      warn(rec.line, '同じ予約番号が CSV の中に重複しているため、2 件目以降を取り込みませんでした。');
      continue;
    }
    seen.add(key);
    const where = { facilityId_externalKey: { facilityId, externalKey: key } };
    const existing = await prisma.reservation.findUnique({
      where, select: { id: true, localCheckedInAt: true, _count: { select: { payments: true } } },
    });

    // 取消は取り込まない。取り込み済みの予約が取消になったら削除する
    // （チェックイン済み・入金ありの予約は、お金の記録を残すため取消として残し、注意を出す）
    if (isCancelled(rec.status)) {
      summary.cancelled++;
      if (!existing) continue;
      if (existing.localCheckedInAt || existing._count.payments > 0) {
        summary.cancelKept++;
        warn(rec.line, `チェックイン済み・入金ありの予約（${rec.guestName} 様）が取消になっています。記録を残すため削除していません。フロントで確認してください。`);
        if (!dryRun) await prisma.reservation.update({ where: { id: existing.id }, data: { status: rec.status } });
        continue;
      }
      summary.cancelRemoved++;
      if (!dryRun) await prisma.reservation.delete({ where: { id: existing.id } });
      continue;
    }

    if (rec.phoneBroken) summary.phoneBroken++;
    if (!rec.roomTypeCode) warn(rec.line, `室タイプ「${rec.roomTypeRaw ?? ''}」から記号を読み取れませんでした。部屋割りでは全タイプの空室から選びます。`);

    const totalAmount = rec.totalAmount ?? 0;
    const data = {
      bookingNo: rec.bookingNo,
      status: rec.status,
      arrival: rec.arrival,
      departure: rec.departure,
      nights: rec.nights,
      pax: rec.pax,
      roomCount: Math.max(1, rec.roomCount ?? 1),
      roomTypeCode: rec.roomTypeCode,
      roomType: rec.roomType,
      planName: rec.planName,
      channel: rec.channel,
      guestName: rec.guestName,
      phone: rec.phone,
      settlement: rec.settlement,
      couponPoints: rec.couponPoints ?? 0,
      totalAmount,
      billed: requiresOnSitePayment(rec.settlement) ? totalAmount : 0,
      memo: rec.memo,
      confirmMark: rec.confirmMark,
      printMark: rec.printMark,
      linkMark: rec.linkMark,
      bookedAt: rec.bookedAt,
      isSample: !!opts.markSample,
    };

    if (dryRun) {
      if (existing) summary.updated++;
      else summary.created++;
      continue;
    }
    await prisma.reservation.upsert({ where, create: { facilityId, externalKey: key, ...data }, update: data });
    if (existing) summary.updated++;
    else summary.created++;
  }

  // 以前の取り込みで残っている取消の予約も片付ける（チェックイン済み・入金ありは残す）
  const leftovers = { facilityId, status: { contains: '取消' }, localCheckedInAt: null, payments: { none: {} } };
  if (dryRun) summary.cancelRemoved += await prisma.reservation.count({ where: leftovers });
  else summary.cancelRemoved += (await prisma.reservation.deleteMany({ where: leftovers })).count;

  if (summary.phoneBroken > 0) {
    warn(0, `${summary.phoneBroken} 件の電話番号が「8.02E+09」のような指数表記になっていたため取り込みませんでした。CSV を Excel で開いて保存すると、こうなります。らく通から出力したままの CSV を使ってください。`);
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
