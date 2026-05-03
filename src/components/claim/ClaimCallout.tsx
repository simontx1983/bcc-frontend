"use client";

/**
 * ClaimCallout — §N8 "Wanted poster" pill + Claim CTA + flow modal.
 *
 * Rendered alongside the IdentityBlock on /v/[slug] when the page is
 * unclaimed AND a claim target resolves. Two visible artifacts:
 *
 *   1. WANTED ribbon (pure CSS treatment — orange/safety tone) signals
 *      to the viewer that this is an unclaimed validator. Always
 *      visible, even for anonymous viewers, so the demo narrative
 *      reads at a glance.
 *
 *   2. CLAIM THIS PAGE button — the entry point. Click opens the
 *      §N8 four-step modal. For anonymous viewers we render the
 *      button disabled with a sign-in tooltip (per §N7 visible-but-
 *      disabled rule).
 *
 * Auth state crosses the RSC boundary as a boolean — the IdentityBlock
 * doesn't know about sessions, so we pass `viewerAuthed` from the
 * page-level server component.
 */

import { useState } from "react";

import { ClaimFlow } from "@/components/claim/ClaimFlow";
import type { CardClaimTarget } from "@/lib/api/types";

interface ClaimCalloutProps {
  pageId: number;
  pageName: string;
  target: CardClaimTarget;
  viewerAuthed: boolean;
}

export function ClaimCallout({
  pageId,
  pageName,
  target,
  viewerAuthed,
}: ClaimCalloutProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mt-6 flex flex-col gap-3">
        <span
          className="bcc-mono inline-flex w-fit items-center gap-2 rounded-sm px-3 py-1.5 text-[11px] tracking-[0.24em]"
          style={{
            color: "var(--safety)",
            background: "rgba(240,90,40,0.10)",
            border: "1px solid rgba(240,90,40,0.40)",
          }}
        >
          <span aria-hidden>★</span>
          WANTED · OPERATOR UNCLAIMED
        </span>

        <p className="font-serif text-cardstock-deep">
          The operator hasn&apos;t verified this page yet. If you control
          this validator&apos;s keys, you can claim it.
        </p>

        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!viewerAuthed}
          aria-disabled={!viewerAuthed}
          title={
            viewerAuthed
              ? "Open the four-step claim flow."
              : "Sign in to claim this validator."
          }
          className={
            "bcc-stencil w-fit rounded-sm px-5 py-2.5 text-[12px] tracking-[0.2em] transition " +
            (viewerAuthed
              ? "bg-ink text-cardstock hover:bg-blueprint"
              : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
          }
        >
          CLAIM THIS PAGE →
        </button>
      </div>

      {open && (
        <ClaimFlow
          pageId={pageId}
          pageName={pageName}
          target={target}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
