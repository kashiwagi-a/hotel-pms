import { prisma } from '@/lib/db';
import { getBusinessDate, getCurrentFacility } from '@/lib/facility';
import { formatDateJa, formatDateTimeJst } from '@/lib/format';
import { BusinessDateForm, ResetDataForm } from './BusinessDateForms';
import { AddRoomsForm } from './AddRoomsForm';
import { RenameTypeForm } from './RenameTypeForm';
import { deleteRoomAction, deleteSampleAction, renameFacilityAction, syncTypeNamesAction, toggleOutOfOrderAction } from './actions';
import { rakutsuTypeNames } from '@/lib/room-types';

export const dynamic = 'force-dynamic';

export default async function RoomsSettingsPage() {
  const facility = await getCurrentFacility();
  const businessDate = await getBusinessDate();
  const [rooms, sampleCount, rakutsu, dayCloses, reservationCount] = await Promise.all([
    prisma.room.findMany({ where: { facilityId: facility.id }, include: { _count: { select: { assignments: true } } } }),
    prisma.reservation.count({ where: { facilityId: facility.id, isSample: true } }),
    // らく通の CSV に出てきた室タイプ（取り込んだ予約から集める）
    rakutsuTypeNames(prisma, facility.id),
    prisma.dayClose.findMany({ where: { facilityId: facility.id }, orderBy: { closedAt: 'desc' }, take: 7 }),
    prisma.reservation.count({ where: { facilityId: facility.id } }),
  ]);
  const floors = new Map<number, typeof rooms>();
  for (const r of [...rooms].sort((a, b) => b.floor - a.floor || a.number.localeCompare(b.number, 'ja', { numeric: true }))) {
    floors.set(r.floor, [...(floors.get(r.floor) ?? []), r]);
  }

  const typeMap = new Map<string, { name: string; codes: Set<string>; count: number }>();
  for (const r of rooms) {
    const t = typeMap.get(r.type) ?? { name: r.type, codes: new Set<string>(), count: 0 };
    t.count++;
    if (r.typeCode) t.codes.add(r.typeCode);
    typeMap.set(r.type, t);
  }
  const types = [...typeMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((t) => ({ name: t.name, codes: [...t.codes].sort(), count: t.count }));
  const rakutsuTypes = [...new Set(rakutsu.values())].sort((a, b) => a.localeCompare(b, 'ja'));
  // 記号は同じなのに名前が違う部屋タイプ（らく通の名前に合わせられるもの）
  const mismatches = [...rakutsu.entries()].flatMap(([code, name]) => {
    const own = [...new Set(rooms.filter((r) => r.typeCode === code && r.type !== name).map((r) => r.type))];
    const count = rooms.filter((r) => r.typeCode === code && r.type !== name).length;
    return own.length ? [{ code, from: own.join('・'), to: name, count }] : [];
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>客室マスタ・設定</h1>
          <div className="sub">インジケーターに表示する部屋を管理します。らく通の CSV に出てこない空室も、ここで登録しておくとインジケーターに表示されます。</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad stack">
          <h2>施設名</h2>
          <form action={renameFacilityAction} className="row">
            <input className="input" name="name" defaultValue={facility.name} aria-label="施設名" required />
            <button className="btn" type="submit">変更</button>
          </form>
          {sampleCount > 0 && (
            <>
              <h2 style={{ marginTop: 8 }}>サンプルデータ</h2>
              <div className="sub">動作確認用の架空の予約が {sampleCount} 件入っています。本番データを取り込む前に削除してください。</div>
              <form action={deleteSampleAction}><button className="btn danger" type="submit">サンプル予約を削除</button></form>
            </>
          )}
        </div>
        <div className="card card-pad stack">
          <h2>部屋を手入力で登録</h2>
          <AddRoomsForm />
        </div>
      </div>

      {mismatches.length > 0 && (
        <div className="card card-pad stack">
          <h2>部屋タイプ名をらく通に合わせる</h2>
          <div className="sub">らく通の予約にある室タイプと記号が同じなのに、名前が違う部屋タイプがあります。</div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>記号</th><th>客室マスタの名前</th><th>らく通の名前</th><th className="num">部屋数</th></tr></thead>
              <tbody>{mismatches.map((m) => <tr key={m.code}><td><b>{m.code}</b></td><td>{m.from}</td><td>{m.to}</td><td className="num">{m.count}</td></tr>)}</tbody>
            </table>
          </div>
          <form action={syncTypeNamesAction}><button className="btn primary" type="submit">らく通の名前に合わせる</button></form>
        </div>
      )}

      <div className="card card-pad stack">
        <h2>部屋タイプ名の変更</h2>
        <div className="sub">同じ部屋タイプ名の部屋をまとめて変更します。新しい名前は、らく通の CSV にある部屋タイプから選ぶか、直接入力できます。</div>
        <RenameTypeForm types={types} rakutsuTypes={rakutsuTypes} />
      </div>

      <div className="grid-2">
        <div className="card card-pad stack">
          <h2>営業日</h2>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{formatDateJa(businessDate, true)}</div>
          <BusinessDateForm businessDate={businessDate} />
          <h2 style={{ marginTop: 8 }}>ナイトオーディットの履歴</h2>
          {dayCloses.length === 0 ? <div className="sub">まだありません。</div> : (
            <ul className="checklist">
              {dayCloses.map((d) => (
                <li key={d.id}><span className="mark ok">締め</span><span>{formatDateJa(d.date, true)} → {formatDateJa(d.nextDate)}（{formatDateTimeJst(d.closedAt)}）{d.note ? ` ・ ${d.note}` : ''}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card card-pad stack">
          <h2>データのリセット</h2>
          <div className="sub">現在の予約：{reservationCount} 件</div>
          <ResetDataForm businessDate={businessDate} />
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>登録済みの部屋（{rooms.length} 室）</h2><span className="sub">故障にすると、インジケーターで赤く表示されます。</span></div>
        {rooms.length === 0 ? (
          <div className="card-pad sub">まだ部屋が登録されていません。</div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>階</th><th>部屋番号</th><th>部屋タイプ</th><th>記号</th><th className="num">定員</th><th>館</th><th>状態</th><th className="num">部屋割り</th><th></th></tr></thead>
              <tbody>
                {[...floors.entries()].flatMap(([floor, list]) => list.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i === 0 ? `${floor}F` : ''}</td>
                    <td><b>{r.number}</b></td>
                    <td>{r.type}</td>
                    <td className="sub">{r.typeCode ?? '—'}</td>
                    <td className="num">{r.capacity ?? '—'}</td>
                    <td className="sub">{r.building ?? '—'}</td>
                    <td>{r.outOfOrder ? <span className="tag" style={{ background: '#fbe1e1', color: '#8b1a1a' }}>故障</span> : <span className="tag ok">使用可</span>}</td>
                    <td className="num">{r._count.assignments}</td>
                    <td className="row" style={{ justifyContent: 'flex-end' }}>
                      <form action={toggleOutOfOrderAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn small" type="submit">{r.outOfOrder ? '故障を解除' : '故障にする'}</button>
                      </form>
                      {r._count.assignments === 0 && (
                        <form action={deleteRoomAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn small danger" type="submit">削除</button>
                        </form>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
