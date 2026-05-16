/**
 * GroupAboutPanel — content of the "About" tab on a community / group /
 * local detail page.
 *
 * Extracted from the inline AboutBody that originally lived in
 * /communities/[slug]/about/page.tsx. Same JSX + helpers, just lifted
 * into a reusable panel component so the three community sub-routes
 * (and /groups/[slug] + /locals/[slug]) can all mount it inside the
 * unified GroupTabs.
 *
 * Server component. Pure presentation — no fetches, no state.
 */

import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type { GroupDetailResponse } from "@/lib/api/types";
import { COMMUNITY_CHAIN_CATALOG } from "@/lib/communities/chain-catalog";

export function GroupAboutPanel({ group }: { group: GroupDetailResponse }) {
  return (
    <article className="bcc-panel flex flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col gap-2">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft">
          ABOUT
        </span>
        <h2 className="bcc-stencil text-2xl text-ink">{group.name}</h2>
      </header>

      {group.description !== null && group.description !== "" ? (
        <p className="font-serif leading-relaxed text-ink-soft">
          {group.description}
        </p>
      ) : (
        <p className="bcc-mono text-[12px] tracking-[0.18em] text-ink-soft/60">
          NO DESCRIPTION YET — THE OWNER HASN&apos;T WRITTEN A DOOR SIGN.
        </p>
      )}

      {/* Meta strip — privacy + member count + activity heat (+ chain +
          trust threshold when set). Mirrors the chip vocabulary on the
          hero so a viewer who jumps tabs sees the same data primitives
          in both places. Trust + Chain cells render conditionally so
          untagged or non-trust groups don't display empty rows. */}
      <dl className="grid gap-4 border-t border-cardstock-edge/40 pt-5 sm:grid-cols-3">
        <MetaCell label="Privacy" value={privacyLabel(group)} />
        <MetaCell
          label="Members"
          value={`${group.member_count.toLocaleString()} ${group.member_count === 1 ? "member" : "members"}`}
        />
        <MetaCell label="Activity" value={null}>
          <HeatBadge activity={group.activity} />
        </MetaCell>
        {group.chain_tag !== null && (
          <MetaCell label="Chain" value={chainLabel(group.chain_tag)} />
        )}
        {group.trust_min !== null && (
          <MetaCell
            label="Trust gate"
            value={`Reputation ≥ ${group.trust_min} to join`}
          />
        )}
      </dl>

      {group.verification !== null && (
        <div className="border-t border-cardstock-edge/40 pt-5">
          <span className="bcc-mono mb-2 block text-[10px] tracking-[0.24em] text-ink-soft">
            VERIFICATION
          </span>
          <VerificationBadge label={group.verification.label} />
        </div>
      )}
    </article>
  );
}

function MetaCell({
  label,
  value,
  children,
}: {
  label: string;
  value: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft">
        {label.toUpperCase()}
      </dt>
      <dd className="bcc-mono text-sm text-ink">
        {value !== null ? value : children}
      </dd>
    </div>
  );
}

function privacyLabel(group: GroupDetailResponse): string {
  // Trust groups use PeepSo's `open` privacy under the hood — without
  // this branch they'd show "anyone can join" while the server gates
  // the actual join on reputation. trust_min wins.
  if (group.trust_min !== null) {
    return `Trust ${group.trust_min}+ · reputation required to join`;
  }
  switch (group.privacy) {
    case "open":   return "Open · anyone can join";
    case "closed": return "Closed · approval required";
    case "secret": return "Secret · invite-only";
  }
}

function chainLabel(slug: string): string {
  return (
    COMMUNITY_CHAIN_CATALOG.find((o) => o.slug === slug)?.label ??
    slug.toUpperCase()
  );
}
