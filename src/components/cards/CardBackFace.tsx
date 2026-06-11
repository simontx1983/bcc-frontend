/**
 * CardBackFace — the back face of the §N2 trading card. Extracted
 * from CardFactory.tsx (Phase 3.3 god-component split); markup and
 * behavior unchanged.
 *
 * Identity → bio → stats → social proof. The bio sits between
 * the handle and the divider so a viewer reading top-down
 * gets context (who) before data (numbers). Skipped when the
 * entity hasn't set a bio.
 */

import { OnchainStatsList } from "@/components/cards/CardOnchainSignals";
import { MemberDossierBack } from "@/components/cards/MemberDossier";
import type { Card } from "@/lib/api/types";

export function CardBackFace({ card }: { card: Card }) {
  return (
    <div className="bcc-card-face bcc-card-back">
      <div className="relative z-10 flex h-full flex-col p-6">
        <h3 className="bcc-stencil text-2xl">{card.name}</h3>
        <p className="bcc-mono mt-1 text-ink-soft">@{card.handle}</p>

        {card.bio !== "" && (
          <p
            className="font-serif italic text-ink-soft"
            style={{
              fontSize: "13px",
              lineHeight: 1.5,
              marginTop: "12px",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            &ldquo;{card.bio}&rdquo;
          </p>
        )}

        <hr className="my-4 border-cardstock-edge/50" />

        {/* Member cards render the trust dossier as their back face
            (VERIFIED / ON THE FLOOR sections, typed-role pills,
            primary-local chip, cold-start fallback). The front-face
            StatsPanel already shows trust/reviews/watchers, so the
            generic stats <dl> is skipped for members to avoid a
            duplicate number wall. Page kinds (validator/project/
            creator) keep the stats + on-chain + social-proof block. */}
        {card.card_kind === "member" && card.member_dossier != null ? (
          <MemberDossierBack dossier={card.member_dossier} />
        ) : (
          <>
            <dl className="space-y-2 text-sm">
              {card.stats.map((stat) => (
                <div key={stat.key} className="flex justify-between gap-4">
                  <dt className="bcc-mono text-ink-soft">{stat.label}</dt>
                  <dd className="font-serif text-ink">{stat.value}</dd>
                </div>
              ))}
            </dl>

            {/* On-chain stats — surfaces under the BCC reputation stats
                so the back-face reads top-down: who they are (bio), what
                BCC knows (trust/followers/etc.), then what the chain
                itself says (commission, self stake, rank, delegators).
                Only renders for validator cards with resolvable signals. */}
            {card.onchain_signals != null && (
              <OnchainStatsList signals={card.onchain_signals} />
            )}

            {card.social_proof?.headline != null && (
              <p className="bcc-mono mt-auto text-ink-soft">
                {card.social_proof.headline}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
