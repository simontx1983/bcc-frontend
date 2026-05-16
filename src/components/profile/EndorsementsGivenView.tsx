"use client";

/**
 * EndorsementsGivenView — the §J.6 "given" sub-tab of BackingPanel.
 *
 * Mirrors the AttestationRoster visual posture: evidence of the
 * operator's stance, NOT a leaderboard. Per Phillip's note carried
 * forward from AttestationRoster:
 *
 *   - Equal row treatment. No styling tied to the endorsed page's
 *     tier or trust_score. The contract carries them; surfacing them
 *     per row would tier the endorsed pages visually and create
 *     hierarchy among an operator's stances.
 *   - No reputation_score on rows. The data ships; the row doesn't.
 *   - No weight / count display. Endorsement weight is internal
 *     to the trust graph synthesis (§J.4.1 invisibility).
 *   - Empty-state copy is observational, not stigmatizing —
 *     "hasn't endorsed any pages yet" reads as a current state,
 *     not a deficit. Per §J risk-assessment §2.9.
 *
 * §A2: every row's display strings (page_title, formatted timestamp)
 * are server-rendered or pure presentation formatting (relative time).
 * No tier classification, no scoring math on the client.
 */

import { useUserEndorsements } from "@/hooks/useUserActivity";
import type { UserEndorsementItem } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

interface EndorsementsGivenViewProps {
  handle: string;
}

export function EndorsementsGivenView({ handle }: EndorsementsGivenViewProps) {
  const { data } = useUserEndorsements(handle);
  const items = data?.items ?? [];

  // Match AttestationRoster pattern: render the same empty-state block
  // during the initial fetch window AND when the server returns zero
  // rows — no spinner state flicker.
  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <section aria-label="Pages this operator has endorsed" className="flex flex-col">
      <ul className="flex flex-col">
        {items.map((item) => (
          <EndorsementRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-cardstock/20 px-6 py-8 text-center">
      <p className="font-serif italic text-cardstock-deep">
        Hasn&rsquo;t endorsed any pages yet. Endorsements show up here as they
        accumulate.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// EndorsementRow — equal visual treatment per row. Title links to the
// endorsed page (entity profile). Page-owner avatar surfaces as the
// row marker — small, square, brutalist. No badges, no weight chip,
// no score. Equal rows.
// ─────────────────────────────────────────────────────────────────────

function EndorsementRow({ item }: { item: UserEndorsementItem }) {
  const hasReason = item.reason !== null && item.reason !== "";
  const linkable = item.page_url !== "";

  return (
    <li className="flex items-start gap-3 border-b border-cardstock/15 py-3 last:border-b-0">
      <PageAvatar avatarUrl={item.avatar_url} title={item.page_title} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {linkable ? (
            <a
              href={item.page_url}
              className="font-serif text-cardstock underline-offset-2 hover:underline"
            >
              {item.page_title}
            </a>
          ) : (
            <span className="font-serif text-cardstock">{item.page_title}</span>
          )}
        </div>
        <div className="bcc-mono flex flex-wrap items-baseline gap-x-3 text-[11px] text-cardstock-deep">
          <span>ENDORSED</span>
          {item.created_at !== null && item.created_at !== "" && (
            <>
              <span>·</span>
              <time dateTime={item.created_at}>
                {formatRelativeTime(item.created_at)}
              </time>
            </>
          )}
        </div>
        {hasReason && (
          <p className="mt-1 font-serif text-cardstock italic">
            &ldquo;{item.reason}&rdquo;
          </p>
        )}
      </div>
    </li>
  );
}

function PageAvatar({
  avatarUrl,
  title,
}: {
  avatarUrl: string;
  title: string;
}) {
  if (avatarUrl === "") {
    // Fallback: stencil monogram from the first character. Page may have
    // no resolvable owner avatar (deleted owner, draft, etc.); the
    // brutalist monogram keeps row rhythm without leaking the gap.
    const monogram = title.charAt(0).toUpperCase() || "?";
    return (
      <div
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center border border-cardstock/30 bg-cardstock-deep/10"
      >
        <span className="bcc-stencil text-base text-cardstock-deep">
          {monogram}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      className="h-10 w-10 shrink-0 border border-cardstock/30 object-cover"
    />
  );
}
