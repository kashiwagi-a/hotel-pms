import { prisma } from '@/lib/db';
import { getCurrentFacility } from '@/lib/facility';
import { formatDateTimeJst } from '@/lib/format';
import { ImportForm } from './ImportForm';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const facility = await getCurrentFacility();
  const logs = await prisma.importLog.findMany({ where: { facilityId: facility.id }, orderBy: { createdAt: 'desc' }, take: 10 });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>らく通 CSV 取込</h1>
          <div className="sub">らく通の「予約一覧」を CSV で出力し、ここから取り込みます。UTF-8 と Shift_JIS のどちらでも読み込めます。取り込んだ予約には、インジケーターで部屋を割り当てます。</div>
        </div>
      </div>
      <ImportForm />
      <div className="card">
        <div className="card-head"><h2>取り込み履歴</h2></div>
        {logs.length === 0 ? (
          <div className="card-pad sub">まだ取り込みはありません。</div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>日時</th><th>ファイル</th><th className="num">行数</th><th className="num">新規</th><th className="num">更新</th><th className="num">取込せず</th><th className="num">注意点</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDateTimeJst(l.createdAt)}</td>
                    <td>{l.fileName}</td>
                    <td className="num">{l.total}</td>
                    <td className="num">{l.created}</td>
                    <td className="num">{l.updated}</td>
                    <td className="num">{l.skipped}</td>
                    <td className="num">{(JSON.parse(l.warnings) as unknown[]).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
