/**
 * App shell — the single layout wrapper for all authenticated pages.
 *
 * Replaces the old PwaShell + per-page BottomNav conflict. Every authenticated
 * page sits inside this shell and gets:
 *   - Safe area insets
 *   - The floating bottom navigation
 *   - Consistent padding for the nav bar
 */

import type { ReactNode } from 'react';
import { BottomNav } from './ui.js';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md">
      <div className="pb-nav">{children}</div>
      <BottomNav />
    </div>
  );
}
