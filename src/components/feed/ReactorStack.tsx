"use client";

/**
 * ReactorStack — stacked-avatar social-proof row for feed cards.
 *
 * Sprint 2 completion of F2 from the cohesion plan: server now ships
 * `social_proof.recent_reactors[]` (up to 3 most-recent unique
 * reactors) alongside the pre-existing `social_proof.headline`. This
 * component renders the stack when reactors are present and falls
 * back to the headline alone when only the text is provided.
 *
 * Constitutional motion policy (Sprint 2):
 *   - Avatars fade in via `bcc-fade-in` on first mount (one-shot).
 *     Later reactors that arrive while the post is on screen are
 *     NOT re-animated on refetch — live insertion would be the
 *     machine-demanding-attention pattern this codebase avoids.
 *   - No hover-scale on avatars. Hover shows the operator's display
 *     name via the native title tooltip — acknowledgment of focus,
 *     not solicitation of the click.
 *   - Order is strict recency (server-supplied). Do not re-sort by
 *     tier/reputation/relationship — curation isn't ours to do here.
 *
 * `headline` is server-rendered text ("Alice and 4 others reacted")
 * and is treated as a paragraph beside the avatars. When the headline
 * is null/empty but reactors exist, the names alone are the proof.
 *
 * The component renders nothing when neither field is populated.
 */

import { memo } from "react";

import { Avatar } from "@/components/identity/Avatar";
import type { FeedSocialProof } from "@/lib/api/types";

interface ReactorStackProps {
  social_proof: FeedSocialProof | undefined;
}

const MAX_VISIBLE_REACTORS = 3;

function ReactorStackImpl({ social_proof }: ReactorStackProps) {
  if (social_proof === undefined) return null;

  const reactors = (social_proof.recent_reactors ?? []).slice(
    0,
    MAX_VISIBLE_REACTORS,
  );
  const headline =
    typeof social_proof.headline === "string" && social_proof.headline !== ""
      ? social_proof.headline
      : null;

  if (reactors.length === 0 && headline === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {reactors.length > 0 && (
        <div className="flex shrink-0 items-center">
          {reactors.map((reactor, index) => (
            <span
              key={`${reactor.handle}-${index}`}
              className={
                "motion-safe:animate-[bcc-fade-in_240ms_ease-out] " +
                (index > 0 ? "-ml-1.5" : "")
              }
              title={
                reactor.display_name !== ""
                  ? reactor.display_name
                  : `@${reactor.handle}`
              }
            >
              <Avatar
                avatarUrl={reactor.avatar_url === "" ? null : reactor.avatar_url}
                handle={reactor.handle}
                displayName={reactor.display_name}
                size="xs"
                variant="rounded"
              />
            </span>
          ))}
        </div>
      )}
      {headline !== null && (
        <p className="bcc-mono text-[11px] text-ink-soft/80">{headline}</p>
      )}
    </div>
  );
}

export const ReactorStack = memo(ReactorStackImpl);
ReactorStack.displayName = "ReactorStack";
