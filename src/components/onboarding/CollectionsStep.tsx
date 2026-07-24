"use client";

/**
 * CollectionsStep — "your collections, your call" during onboarding.
 *
 * Wallet-signup users arrive here with a linked wallet whose
 * collections were discovered server-side at verify time — this step
 * asks the only questions that turn those holdings into real signals:
 * join the live communities, waitlist the ones that aren't activated,
 * flag the airdropped junk. Users without a linked wallet (email
 * signup) see a low-key pointer to settings instead — linking a wallet
 * is NOT an onboarding requirement.
 *
 * All actions commit immediately through the panel's own mutations
 * (same surface as post-wallet-link in settings); Continue/Skip just
 * advances the wizard. Skip is always available.
 */

import Link from "next/link";

import { useMyWallets } from "@/hooks/useWallets";
import { CollectionStancePanel } from "@/components/onchain/CollectionStancePanel";

export function CollectionsStep({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const wallets = useMyWallets();
  const hasWallets = wallets.isSuccess && wallets.data.items.length > 0;

  return (
    <>
      <section className="mx-auto max-w-3xl px-6 pt-12 sm:px-8">
        <h1 className="bcc-stencil text-bcc-text text-5xl md:text-6xl">
          Your collections, your call.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-xl text-bcc-text-secondary">
          {hasWallets
            ? "We read your linked wallets. Join the communities that are live, raise your hand for the ones that aren't, and flag anything that was airdropped junk."
            : "Link a wallet and BCC finds the NFT communities you already belong to."}
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        {hasWallets ? (
          <div className="border border-bcc-border bg-bcc-surface-hover p-4">
            <CollectionStancePanel compact />
          </div>
        ) : (
          <p className="font-serif italic text-bcc-text-secondary">
            No wallet linked yet — you can do it any time on{" "}
            <Link
              href="/u/me?tab=account"
              className="underline-offset-4 hover:underline"
            >
              your Account tab
            </Link>
            , and your collections will show up right there.
          </p>
        )}
      </section>

      <footer className="mx-auto mt-12 flex max-w-3xl items-center justify-between gap-4 px-6 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          className="bcc-mono text-bcc-text-secondary underline-offset-4 hover:underline"
        >
          ← Back
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onDone}
            className="bcc-mono text-bcc-text-secondary underline-offset-4 hover:underline"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onDone}
            className="bcc-stencil flex items-center gap-3 bg-safety px-6 py-3 text-ink"
          >
            Continue
          </button>
        </div>
      </footer>
    </>
  );
}
