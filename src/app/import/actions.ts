'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { decodeCsvBytes, RakutsuCsvError } from '@/lib/rakutsu-csv';
import { importRakutsuCsv, type ImportSummary } from '@/lib/import-rakutsu';

export type ImportState = { ok: true; summary: ImportSummary } | { ok: false; error: string } | null;

const MAX_BYTES = 10 * 1024 * 1024;

export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'CSV ファイルを選択してください。' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'ファイルが大きすぎます（10MB まで）。' };

  const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
  const facility = await getCurrentFacility();
  try {
    const summary = await importRakutsuCsv(prisma, {
      facilityId: facility.id,
      text,
      fileName: file.name,
      dryRun: formData.get('dryRun') === 'on',
    });
    if (!summary.dryRun) {
      revalidatePath('/indicator');
      revalidatePath('/reservations');
      revalidatePath('/import');
    }
    return { ok: true, summary };
  } catch (e) {
    if (e instanceof RakutsuCsvError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: '取り込み中にエラーが発生しました。ターミナルのログを確認してください。' };
  }
}
