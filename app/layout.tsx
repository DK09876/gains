import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import Nav from '@/components/Nav';
import ProfileGate from '@/components/ProfileGate';
import ProfileSwitcher from '@/components/ProfileSwitcher';
import ServiceWorker from '@/components/ServiceWorker';

import './globals.css';

export const metadata: Metadata = {
  title: 'Gains',
  description: 'Plan workouts, watch the form clips, and log what you lift.',
  // Saved to an iPhone's home screen from Safari, it opens full screen with
  // this name and icon; the page runs under the status bar (see globals.css).
  appleWebApp: { capable: true, title: 'Gains', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png', icon: '/icons/icon-192.png' },
  formatDetection: { telephone: false },
  // Next writes only the standard mobile-web-app-capable; older iOS wants its own.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#0f1211',
  width: 'device-width',
  initialScale: 1,
  // Draw to the screen's edges; the notch and home bar are padded in CSS.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <nav className="safe-x mx-auto flex max-w-3xl items-center gap-2 py-3 sm:gap-4">
            <Link href="/" className="whitespace-nowrap text-lg font-bold tracking-tight">
              <span className="text-[var(--accent)]">Gains</span>
            </Link>
            <div className="ml-auto flex items-center gap-0.5 text-sm sm:gap-1">
              <Nav />
              <ProfileSwitcher />
            </div>
          </nav>
        </header>
        <main className="safe-x mx-auto max-w-3xl pb-[max(2rem,env(safe-area-inset-bottom))] pt-5">
          <ProfileGate>{children}</ProfileGate>
        </main>
        <ServiceWorker />
      </body>
    </html>
  );
}
