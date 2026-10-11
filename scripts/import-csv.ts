/**
 * らく通「予約一覧」CSV をコマンドラインから取り込む
 *
 *   npm run import:csv -- <CSVファイル> [--dry-run]
 *
 * --dry-run を付けると、データベースを変更せずに件数と注意点だけを表示する。
 * 個人情報を画面に出さないよう、表示は件数と行番号だけにしている。
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { decodeCsvBytes, RakutsuCsvError } from '../src/lib/rakutsu-csv';
import { importRakutsuCsv } from '../src/lib/import-rakutsu';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('使い方: npm run import:csv -- <CSVファイル> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    const facility = await prisma.facility.findFirst({ orderBy: { id: 'asc' } })
      ?? await prisma.facility.create({ data: { name: 'メイン施設' } });
    const text = decodeCsvBytes(new Uint8Array(readFileSync(file)));
    const s = await importRakutsuCsv(prisma, { facilityId: facility.id, text, fileName: basename(file), dryRun });
    console.log(`${dryRun ? '【確認のみ】' : ''}${s.fileName}: ${s.total} 行 / 新規 ${s.created} / 更新 ${s.updated} / 取消のため除外 ${s.cancelled} / 取込せず ${s.skipped}`);
    if (s.cancelRemoved) console.log(`取消になった予約 ${s.cancelRemoved} 件を${dryRun ? '削除します' : '削除しました'}`);
    if (s.unknownColumns.length) console.log(`読み込まなかった列: ${s.unknownColumns.join(', ')}`);
    for (const w of s.warnings) console.log(w.line ? `  ${w.line} 行目: ${w.message}` : `  ${w.message}`);
  } catch (e) {
    if (e instanceof RakutsuCsvError) {
      console.error(e.message);
      process.exitCode = 1;
    } else {
      throw e;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
