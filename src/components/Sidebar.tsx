'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatDateJa } from '@/lib/format';

type Item = { href: string; label: string; icon: React.ReactNode };

const svg = (d: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

const ITEMS: Item[] = [
  { href: '/dashboard', label: 'ダッシュボード', icon: svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>) },
  { href: '/indicator', label: 'インジケーター', icon: svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>) },
  { href: '/reservations', label: '予約', icon: svg(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4M9 10h6M9 14h6M9 18h3" /></>) },
  { href: '/inventory', label: '在庫', icon: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>) },
  { href: '/accounting', label: 'フロント会計（集計）', icon: svg(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>) },
  { href: '/reports', label: 'レポート', icon: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />) },
  { href: '/import', label: 'らく通 CSV 取込', icon: svg(<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />) },
  { href: '/settings/rooms', label: '客室マスタ・設定', icon: svg(<><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="#15202B" /><circle cx="15" cy="12" r="2" fill="#15202B" /><circle cx="9" cy="18" r="2" fill="#15202B" /></>) },
];

export function Sidebar({ facilityName, businessDate }: { facilityName: string; businessDate: string }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7FB3D5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V5l7-3 7 3v16" /><path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" /></svg>
        宿泊管理
      </div>
      <div className="facility">施設<b>{facilityName}</b></div>
      <Link href="/dashboard#night-audit" className="bizdate" title="ナイトオーディットで翌日へ進めます">
        <span>営業日</span>
        <b>{formatDateJa(businessDate, true)}</b>
      </Link>
      <nav className="nav" aria-label="主メニュー">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'on' : undefined} aria-current={pathname.startsWith(item.href) ? 'page' : undefined}>
            {item.icon}{item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
