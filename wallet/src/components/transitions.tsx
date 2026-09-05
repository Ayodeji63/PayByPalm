/**
 * Page transition wrapper.
 *
 * Wraps route content with a fade-up entrance animation. Direction-aware
 * sliding would require tracking navigation direction; for now, a simple
 * fade-up gives the app a smooth, non-jarring feel between pages.
 */

import type { ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}

/** Staggered list entrance animation. Wrap a list's parent element. */
export function StaggerContainer({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`stagger ${className}`}>{children}</div>;
}
