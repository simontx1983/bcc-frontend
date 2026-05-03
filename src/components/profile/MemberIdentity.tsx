/**
 * MemberIdentity — the dominant typographic block in the hero.
 *
 * A clamp-sized stencil name fills the available width, with the
 * Fraunces italic display-name softening it inside an <em>, then a
 * meta strip and the primary actions. Everything is server-formatted
 * (handle case, joined date label, primary local label).
 *
 * Naming convention from the prototype: kicker → name → sub → meta → actions.
 */

import Link from "next/link";
import type { Route } from "next";

import { BlockToggle } from "@/components/profile/BlockToggle";
import type { Phase4MemberProfile } from "@/lib/api/types";

// Phase-4 design scaffold. The live MemberProfile shape (§3.1) doesn't
// supply `card`, `identity_meta`, or a structured `bio` — this
// component reads the speculative super-shape that the backend will
// expose once a §9 contract amendment lands. Decoupled from the real
// MemberProfile to keep the design work compilable.
interface MemberIdentityProps {
  profile: Phase4MemberProfile;
  /** True when the viewer is the owner — toggles Edit / Settings actions. */
  isOwner: boolean;
}

export function MemberIdentity({ profile, isOwner }: MemberIdentityProps) {
  return (
    <div className="bcc-stage-reveal" style={{ ["--stagger" as string]: "180ms" }}>
      {/* Kicker: badges that say "what kind of member is this?".
          tier_label + rank_label are server-rendered per §A2 — we
          render them verbatim and suppress the chip when absent. */}
      <div className="bcc-mono mb-4 flex flex-wrap items-center gap-3 text-safety">
        {profile.card.tier_label !== null && (
          <span
            className="bg-weld text-ink px-2 py-[2px]"
            style={{ fontWeight: 700, letterSpacing: "0.18em" }}
          >
            {profile.card.tier_label.toUpperCase()}
          </span>
        )}
        {profile.card.rank_label !== null && (
          <span
            className="bg-verified px-2 py-[2px] text-white"
            style={{ fontWeight: 700, letterSpacing: "0.18em" }}
          >
            {profile.card.rank_label.toUpperCase()}
          </span>
        )}
        <span>· @{profile.handle}</span>
      </div>

      {/* Big stencil name — fills the column. <em> renders the
          display-name in Fraunces italic gold, evoking the magazine
          feature treatment from the prototype. */}
      <h1
        className="bcc-stencil text-cardstock"
        style={{
          fontSize: "clamp(56px, 7vw, 124px)",
          lineHeight: 0.86,
          letterSpacing: "-0.02em",
        }}
      >
        {profile.display_name.split(" ").map((word, i, arr) =>
          i === arr.length - 1 ? (
            <em
              key={`${word}-${i}`}
              className="text-weld"
              style={{
                fontStyle: "italic",
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 600,
                fontSize: "0.68em",
                letterSpacing: "-0.01em",
                textTransform: "none",
              }}
            >
              {word}
            </em>
          ) : (
            <span key={`${word}-${i}`}>{word} </span>
          ),
        )}
      </h1>

      {/* Editorial sub — italicized intro line, server-supplied (first
          paragraph of bio, truncated on the API side). Falls back to
          a generic line if absent. */}
      <p
        className="font-serif italic text-cardstock/80"
        style={{ fontSize: "18px", lineHeight: 1.45, maxWidth: "680px", marginTop: "12px" }}
      >
        {profile.bio_block.paragraphs[0]?.split(".")[0]}.
      </p>

      {/* Meta strip — server-pre-rendered fact row */}
      <dl className="bcc-mono mt-5 flex flex-wrap gap-x-5 gap-y-2 text-cardstock/65">
        {profile.identity_meta.map((entry) => (
          <div key={entry.label} className="flex gap-2">
            <dt className="text-cardstock/45">{entry.label.toUpperCase()}</dt>
            <dd className="text-cardstock" style={{ fontWeight: 500 }}>{entry.value}</dd>
          </div>
        ))}
      </dl>

      {/* Actions — owner sees Settings + Edit; viewer sees Vouch + Send.
          Vouch + Send Message are V2 surfaces (per §V2-locked-scope);
          rendered as visibly-disabled per §N7 so the slot exists but
          the action doesn't lie about working. */}
      <div className="mt-5 flex flex-wrap gap-3">
        {isOwner ? (
          <>
            <Link
              href={"/settings/identity" as Route}
              className="bcc-btn bcc-btn-primary"
            >
              Edit Profile
            </Link>
            <Link
              href={"/settings/identity" as Route}
              className="bcc-btn bcc-btn-ghost"
            >
              Open Settings
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled
              aria-disabled
              title="Vouching unlocks in V2."
              className="bcc-btn bcc-btn-primary cursor-not-allowed opacity-60"
            >
              Vouch For
            </button>
            <button
              type="button"
              disabled
              aria-disabled
              title="Direct messages unlock in V2."
              className="bcc-btn bcc-btn-ghost cursor-not-allowed opacity-60"
            >
              Send Message
            </button>
            <BlockToggle profile={profile} />
          </>
        )}
      </div>
    </div>
  );
}
