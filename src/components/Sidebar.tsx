'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { href: string; label: string; icon: React.ReactNode };

const I = {
  grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>,
  book: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4M9 10h6M9 14h6M9 18h3" /></svg>,
  upload: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>,
  rooms: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="#15202B" /><circle cx="15" cy="12" r="2" fill="#15202B" /><circle cx="9" cy="18" r="2" fill="#15202B" /></svg>,
  dot: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>,
};

const ITEMS: Item[] = [
  { href: '/indicator', label: 'インジケーター', icon: I.grid },
  { href: '/reservations', label: '予約', icon: I.book },
  { href: '/import', label: 'らく通 CSV 取込', icon: I.upload },
  { href: '/settings/rooms', label: '客室マスタ・設定', icon: I.rooms },
];

// モックにあって、まだ実装していない画面
const LATER = ['ダッシュボード', '在庫', 'フロント会計（集計）', 'レポート'];

export function Sidebar({ facilityName }: { facilityName: string }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7FB3D5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V5l7-3 7 3v16" /><path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" /></svg>
        宿泊管理
      </div>
      <div className="facility">施設<b>{facilityName}</b></div>
      <nav className="nav" aria-label="主メニュー">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'on' : undefined}>
            {item.icon}{item.label}
          </Link>
        ))}
        {LATER.map((label) => (
          <span key={label} aria-disabled="true">{I.dot}{label}<small>準備中</small></span>
        ))}
      </nav>
    </aside>
  );
}
