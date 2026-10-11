import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { getCurrentFacility } from '@/lib/facility';

export const metadata: Metadata = {
  title: '宿泊管理',
  description: '宿泊予約・客室・フロント会計の管理',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const facility = await getCurrentFacility();
  return (
    <html lang="ja">
      <body>
        <div className="app">
          <Sidebar facilityName={facility.name} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
