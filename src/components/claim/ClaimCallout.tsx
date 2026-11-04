"use client";

/**
 * ClaimCallout — §N8 unclaimed pill + Claim CTA + flow modal.
 *
 * Rendered alongside the IdentityBlock on /v/[slug] when the page is
 * unclaimed AND a claim target resolves. Two visible artifacts:
 *
 *   1. Unclaimed ribbon (pure CSS treatment — orange/safety tone) signals
 *      to the viewer that this is an unclaimed validator. Always visible,
 *      even for anonymous viewers. ⚠ Neutral on purpose: the operator may
 *      arrive here from a cold message, where "WANTED" reads as a threat.
 *
 *   2. CLAIM THIS PAGE button — the entry point. Click opens the
 *      §N8 four-step modal. Anonymous viewers get working sign-in and
 *      sign-up links instead, and chains that can't be claimed get the
 *      reason up front, so nobody makes an account to hit a dead end.
 *
 * Auth state crosses the RSC boundary as a boolean — the IdentityBlock
 * doesn't know about sessions, so we pass `viewerAuthed` from the
 * page-level server component.
 */

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ClaimFlow } from "@/components/claim/ClaimFlow";
import type { CardClaimTarget } from "@/lib/api/types";
import { LEGAL } from "@/lib/legal/config";
import { isChainClaimable, unsupportedClaimReason } from "@/lib/wallet/claim-support";

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
  const pathname = usePathname();
  const claimable = isChainClaimable(target.chain_slug);

  return (
    <>
      <div className="mt-6 flex flex-col gap-3">
        <span
          className="bcc-mono inline-flex w-fit items-center gap-2 rounded-sm px-3 py-1.5 text-[11px] tracking-[0.24em]"
          style={{
            color: "var(--safety)",
            background: "rgb(var(--safety-rgb) / 0.10)",
            border: "1px solid rgb(var(--safety-rgb) / 0.40)",
          }}
        >
          UNCLAIMED · IS THIS YOURS?
        </span>

        {claimable ? (
          <>
            <p className="font-serif text-bcc-text-secondary">
              The operator hasn&apos;t verified this page yet. If you control
              this validator&apos;s keys, you can claim it.
            </p>

            {viewerAuthed ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                title="Open the four-step claim flow."
                className="bcc-stencil w-fit rounded-sm bg-ink px-5 py-2.5 text-[12px] tracking-[0.2em] text-cardstock transition hover:bg-blueprint"
              >
                CLAIM THIS PAGE →
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(pathname)}` as Route}
                  className="bcc-stencil w-fit rounded-sm bg-ink px-5 py-2.5 text-[12px] tracking-[0.2em] text-cardstock transition hover:bg-blueprint"
                >
                  SIGN IN TO CLAIM →
                </Link>
                <p className="font-serif text-sm text-bcc-text-secondary">
                  New here?{" "}
                  <Link href="/signup" className="underline">
                    Create a free account
                  </Link>
                  , then come back to this page to claim it.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="font-serif text-bcc-text-secondary">
              {unsupportedClaimReason(target.chain_slug)}
            </p>
            <p className="font-serif text-sm text-bcc-text-secondary">
              Your page stays up and you don&apos;t need to do anything.
              Questions?{" "}
              <a href={`mailto:${LEGAL.legalEmail}`} className="underline">
                {LEGAL.legalEmail}
              </a>
            </p>
          </>
        )}
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
