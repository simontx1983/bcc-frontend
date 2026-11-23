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
 *
 * F-552: whether the page can be claimed is the SERVER's answer
 * (claim_target.claimable / can_claim, contract F-515), never a chain
 * allowlist of ours. Its reason is rendered verbatim. can_claim's other
 * refusals: not_applicable shows nothing, suspended shows its line
 * instead of the button.
 */

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ClaimFlow } from "@/components/claim/ClaimFlow";
import { claimabilityOf, NO_WALLET_FOR_CHAIN_COPY } from "@/components/claim/claimability";
import type { CardClaimTarget, CardPermissionEntry } from "@/lib/api/types";
import { LEGAL } from "@/lib/legal/config";
import { findWalletChain } from "@/lib/wallet/chain-catalog";

interface ClaimCalloutProps {
  pageId: number;
  pageName: string;
  target: CardClaimTarget;
  viewerAuthed: boolean;
  /** The page's permissions.can_claim (F-301 / F-515); absent on an older backend. */
  canClaim?: CardPermissionEntry | undefined;
}

export function ClaimCallout({
  pageId,
  pageName,
  target,
  viewerAuthed,
  canClaim,
}: ClaimCalloutProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { claimable, hint } = claimabilityOf(target, canClaim);
  // The server can say "claimable" for a chain this frontend has no wallet
  // for (kujira): then no button that can only dead-end, and an honest line.
  const walletAvailable = findWalletChain(target.chain_slug) !== undefined;
  const claimableHere = claimable && walletAvailable;
  // Nothing to claim (already claimed, or no target): render nothing.
  if (canClaim?.reason_code === "not_applicable") return null;
  // A signed-in member the server refuses for themselves (suspended) gets
  // the server's line instead of a button that can only fail.
  const refusal =
    claimableHere && viewerAuthed && canClaim !== undefined && !canClaim.allowed && canClaim.reason_code !== "signin_required"
      ? canClaim.unlock_hint
      : null;
  return (
    <>
      <div className="mt-6 flex flex-col gap-3">
        <span
          className="bcc-mono inline-flex w-fit items-center gap-2 rounded-sm px-3 py-1.5 text-[11px] tracking-[0.24em]"
          style={{
            color: "var(--bcc-text-safety)",
            background: "rgb(var(--safety-rgb) / 0.10)",
            border: "1px solid rgb(var(--safety-rgb) / 0.40)",
          }}
        >
          {/* S7 (figma's audit): an unclaimable page doesn't ask "is this
              yours?" and then say it can't be claimed. Chain-neutral: the
              reason is the server's hint below. */}
          {claimableHere ? "UNCLAIMED · IS THIS YOURS?" : "UNCLAIMED · CLAIMING NOT OPEN YET"}
        </span>

        {claimableHere ? (
          <>
            <p className="font-serif text-bcc-text-secondary">
              The operator hasn&apos;t verified this page yet. If you control
              this validator&apos;s keys, you can claim it.
            </p>

            {refusal !== null ? (
              <p className="font-serif text-sm text-bcc-text-secondary">{refusal}</p>
            ) : viewerAuthed ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                title="Open the four-step claim flow."
                className="bcc-btn bcc-btn-primary min-h-[44px] w-fit px-5 tracking-[0.2em]"
              >
                CLAIM THIS PAGE →
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(pathname)}` as Route}
                  className="bcc-btn bcc-btn-primary min-h-[44px] w-fit px-5 tracking-[0.2em]"
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
            <p className="font-serif text-bcc-text-secondary">{claimable ? NO_WALLET_FOR_CHAIN_COPY : hint}</p>
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
