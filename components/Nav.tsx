'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Today' },
  { href: '/plan', label: 'Plan' },
  { href: '/history', label: 'History' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <>
      {TABS.map((tab) => {
        const active = tab.href === '/' ? path === '/' : path.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-2 py-2.5 sm:px-3 ${active ? 'bg-[var(--surface)] text-[var(--foreground)]' : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]'}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
