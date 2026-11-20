/**
 * AboutCard — the "Reputation card" shell every About section shares:
 * a theme-surface `.bcc-panel` (16px padding, 8px radius from the class)
 * headed by the signature mono micro-label, optionally "LABEL · N".
 *
 * `aside` fills the header's top-right corner: the owner's "HIDDEN FROM
 * YOUR PROFILE" marker on About, the SHOW ON PROFILE switch on Edit About.
 */

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

export function AboutCard({
  label,
  count,
  children,
  testId,
  aside,
}: {
  label: string;
  count?: number | undefined;
  children: ReactNode;
  testId?: string | undefined;
  aside?: ReactNode;
}) {
  const heading = (
    <h2 className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary">
      {label}
      {count !== undefined && ` · ${count}`}
    </h2>
  );
  return (
    <section className="bcc-panel" data-testid={testId}>
      {aside === undefined || aside === null ? (
        heading
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {heading}
          {aside}
        </div>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** "SEE ALL N BLOGS →" — a ≥44px mono link at the foot of a card. */
export function AboutSeeAll({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="bcc-mono mt-2 flex min-h-[44px] items-center text-[11px] uppercase tracking-[0.18em] text-bcc-text underline decoration-[var(--bcc-accent-indicator)] underline-offset-4"
    >
      {children}
    </Link>
  );
}

/** "← BACK TO PROFILE" / "← BACK TO ABOUT". */
export function AboutBackLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="bcc-mono inline-flex min-h-[44px] items-center text-[11px] uppercase tracking-[0.18em] text-bcc-text-secondary hover:text-bcc-text"
    >
      <span aria-hidden className="mr-1 text-bcc-text-secondary">←</span>
      {children}
    </Link>
  );
}
