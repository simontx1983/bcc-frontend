"use client";

/**
 * DisputesRoom — /disputes top-level surface.
 *
 * Single queue since the Rank Phase 6 panel retirement: the viewer's
 * filed cases (<MyDisputesList>, the page-owner outbox). Each case
 * resolves via an open community vote that lives on the case detail
 * surface — there is no assignment queue and no participation strip.
 */

import { MyDisputesList } from "@/components/disputes/MyDisputesList";

export function DisputesRoom() {
  return (
    <main className="mx-auto max-w-[1200px] px-7 pb-24 pt-12">
      <div className="border-b border-dashed border-bcc-border pb-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; DISPUTES</span>
        </span>
      </div>

      <header className="mt-10" data-bcc-tour="disputes.room">
        <p className="bcc-mono text-safety">DISPUTE ROOM</p>
        <h1
          className="bcc-stencil mt-2 text-bcc-text leading-[0.95]"
          style={{ fontSize: "clamp(2.25rem, 5.5vw, 4.5rem)" }}
        >
          Cases on, cases out.
        </h1>
        <p className="mt-3 max-w-2xl font-serif leading-relaxed text-bcc-text-secondary">
          Downvotes you have challenged on pages you own. Each case goes
          to an open community vote &mdash; evidence in, weighted ballots
          in, judgment out. Tallies stay sealed until a vote closes.
        </p>
      </header>

      <div className="mt-10">
        <MyDisputesList />
      </div>
    </main>
  );
}
