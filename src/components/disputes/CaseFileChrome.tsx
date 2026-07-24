/**
 * CaseFileChrome — page shell for /disputes/[id], plus the loading /
 * error / missing states that render inside it. Extracted from
 * DisputeDetail.tsx (Phase 3.3 god-component split); markup and
 * behavior unchanged.
 *
 * The chrome owns the file-rail crumb and the safety underline that
 * visually frames the case below it. Same vocabulary as /u/[handle]'s
 * FileRail so the surface reads as part of the same "operator file"
 * universe.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export function CaseFileChrome({
  children,
  caseNumber,
}: {
  children: ReactNode;
  caseNumber?: number;
}) {
  return (
    <main className="mx-auto max-w-[1200px] px-7 pb-24 pt-10">
      <div className="border-b border-dashed border-bcc-border pb-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; DISPUTES</span>
          {caseNumber !== undefined && (
            <span className="text-bcc-text">
              &nbsp;//&nbsp; CASE №{caseNumber}
            </span>
          )}
        </span>
      </div>

      <div
        aria-hidden
        className="mt-3 h-[2px]"
        style={{ background: "var(--safety)" }}
      />

      {children}

      <div className="mt-12 border-t border-dashed border-bcc-border pt-5">
        <Link
          href="/disputes"
          className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary transition hover:text-safety"
        >
          <span aria-hidden>&larr;</span>
          <span>BACK TO DISPUTE ROOM</span>
        </Link>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CaseFileSkeleton — loading state. Mirrors the case-file skeleton so
// the layout doesn't shift on hydration.
// ─────────────────────────────────────────────────────────────────────

export function CaseFileSkeleton() {
  return (
    <div aria-busy="true" className="mt-10">
      <p className="bcc-mono text-bcc-text-secondary">PULLING FILE…</p>
      <div className="mt-6 h-32 w-2/3 bg-bcc-surface-hover" />
      <div className="mt-4 h-6 w-3/4 bg-bcc-surface-hover" />
      <div className="mt-12 grid gap-10 md:grid-cols-[1fr_minmax(320px,400px)] md:gap-12">
        <div className="flex flex-col gap-6">
          <div className="h-5 w-24 bg-bcc-surface-hover" />
          <div className="h-24 w-full bg-bcc-surface-hover" />
          <div className="h-24 w-full bg-bcc-surface-hover" />
        </div>
        <div className="h-64 w-full bg-bcc-surface-hover" />
      </div>
    </div>
  );
}

export function CaseFileError({ message }: { message: string }) {
  return (
    <div className="mt-10 border-2 border-safety p-6">
      <p className="bcc-mono text-safety">CASE FILE ERROR //</p>
      <p className="bcc-stencil mt-2 text-2xl text-bcc-text">
        Couldn&rsquo;t load the case.
      </p>
      <p role="alert" className="bcc-mono mt-3 text-bcc-text-muted">
        {message}
      </p>
    </div>
  );
}

export function CaseFileMissing({ id }: { id: number }) {
  return (
    <div className="mt-10 border-2 border-bcc-border p-6">
      <p className="bcc-mono text-bcc-text-secondary">NOT IN YOUR FILES //</p>
      <p className="bcc-stencil mt-2 text-3xl text-bcc-text">
        Case №{id} isn&rsquo;t on your floor.
      </p>
      <p
        className="mt-3 font-serif text-bcc-text-secondary"
        style={{ fontSize: "15px", lineHeight: 1.55 }}
      >
        Either it never landed in your panel duty queue, you didn&rsquo;t
        file it, or the dispute closed and rolled off your active list.
        The detail surface only mirrors what your two queues already hold.
      </p>
    </div>
  );
}
