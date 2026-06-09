/**
 * MemberDossier — shared back-of-card trust dossier for member cards.
 *
 * Relocated verbatim from the retired `FlippableMemberCard` (the only
 * change is the source type: these renderers read the `MemberDossier`
 * block off a member `Card` instead of the slim `MemberSummary`). No
 * presentation logic changed — same VERIFIED / ON THE FLOOR sections,
 * same typed-role pills, same primary-local chip, same cold-start
 * fallback.
 *
 * CardFactory drops `<MemberDossierBack dossier={card.member_dossier} />`
 * onto the back face for `card_kind === "member"`. The component owns
 * ONLY presentation (§A2) — every value it renders comes pre-resolved
 * from the server.
 */

import type { MemberDossier } from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────
// MemberDossierBack — the full back-face composition: pills row +
// VERIFIED / ON THE FLOOR sections, or the cold-start fallback when
// every signal is empty.
// ─────────────────────────────────────────────────────────────────────

export function MemberDossierBack({ dossier }: { dossier: MemberDossier }) {
  const v = dossier.verifications;
  const e = dossier.engagement;
  const typedRoles = collectTypedRoleBadges(dossier.owned_pages_by_type);

  // Cold-start signal: brand-new account with nothing on the wire yet.
  // Show a single muted line instead of a wall of "—" / 0 rows.
  const hasAnySignal =
    v.x_verified ||
    v.github_verified ||
    v.wallets_verified > 0 ||
    e.endorsements_received > 0 ||
    e.reviews_written > 0 ||
    e.disputes_signed > 0 ||
    typedRoles.length > 0 ||
    dossier.primary_local !== null;

  return (
    <>
      {/* Pills row — typed role badges + primary local pill. Compact;
          only renders the chips with content so a community member with
          no owned pages and no primary local doesn't get an empty band. */}
      {(typedRoles.length > 0 || dossier.primary_local !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {typedRoles.map((role) => (
            <TypedRoleBadge
              key={role.type}
              type={role.type}
              count={role.count}
              label={role.label}
            />
          ))}
          {dossier.primary_local !== null && (
            <PrimaryLocalChip local={dossier.primary_local} />
          )}
        </div>
      )}

      {hasAnySignal ? (
        <>
          <DossierSection label="VERIFIED">
            <Row
              label="X"
              value={
                v.x_verified
                  ? v.x_username !== null
                    ? `✓ @${v.x_username}`
                    : "✓"
                  : "—"
              }
              dim={!v.x_verified}
            />
            <Row
              label="GITHUB"
              value={
                v.github_verified
                  ? v.github_username !== null
                    ? `✓ @${v.github_username}`
                    : "✓"
                  : "—"
              }
              dim={!v.github_verified}
            />
            <Row
              label="WALLETS"
              value={v.wallets_verified > 0 ? `✓ ${v.wallets_verified}` : "—"}
              dim={v.wallets_verified === 0}
            />
          </DossierSection>

          <DossierSection label="ON THE FLOOR" topGap>
            <Row
              label="ENDORSEMENTS"
              value={String(e.endorsements_received)}
              dim={e.endorsements_received === 0}
            />
            <Row
              label="REVIEWS"
              value={String(e.reviews_written)}
              dim={e.reviews_written === 0}
            />
            <Row
              label="DISPUTES"
              value={String(e.disputes_signed)}
              dim={e.disputes_signed === 0}
            />
          </DossierSection>
        </>
      ) : (
        <p className="bcc-mono mt-6 text-center text-[12px] italic leading-relaxed text-ink-soft">
          Nothing on file yet — fresh account.
        </p>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DossierSection / Row — labelled section + dl-pair primitives.
// ─────────────────────────────────────────────────────────────────────

export function DossierSection({
  label,
  topGap = false,
  children,
}: {
  label: string;
  topGap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={topGap ? "mt-3" : "mt-2"}>
      {/* Section labels render in full ink, not the muted cardstock-
          deep tone — these are structural headers ("VERIFIED" / "ON
          THE FLOOR"), not supplementary chrome. They need to read as
          first-class sections against the cream panel. */}
      <p className="bcc-mono text-[10px] tracking-[0.18em] text-ink">{label}</p>
      <dl className="mt-1 space-y-0.5">{children}</dl>
    </div>
  );
}

export function Row({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={
          "bcc-mono text-[10px] tracking-[0.16em] " +
          (dim ? "text-ink-ghost" : "text-ink-soft")
        }
      >
        {label}
      </dt>
      <dd
        className={
          "bcc-mono text-[11px] " + (dim ? "text-ink-ghost" : "text-ink")
        }
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Typed role badges + primary local pill — the back face's pills row.
// Same canonical type slugs and color palette the chip strip uses on
// the directory filter (`--owned-type-*` CSS vars). Render order is
// fixed (validator → project → nft → dao) so a heavy operator looks the
// same on every visit.
// ─────────────────────────────────────────────────────────────────────

type OwnedPageType = keyof MemberDossier["owned_pages_by_type"];

const TYPE_LABELS: Record<OwnedPageType, { singular: string; plural: string }> = {
  validator: { singular: "VALIDATOR", plural: "VALIDATORS" },
  project: { singular: "PROJECT", plural: "PROJECTS" },
  nft: { singular: "NFT COLLECTION", plural: "NFT COLLECTIONS" },
  dao: { singular: "DAO", plural: "DAOS" },
};

const TYPE_RENDER_ORDER: OwnedPageType[] = ["validator", "project", "nft", "dao"];

const TYPE_CHIP_STYLE: Record<OwnedPageType, { bg: string; text: string }> = {
  validator: { bg: "var(--owned-type-validator)", text: "#fff" },
  project: { bg: "var(--owned-type-project)", text: "var(--ink, #0f0d09)" },
  nft: { bg: "var(--owned-type-nft)", text: "#fff" },
  dao: { bg: "var(--owned-type-dao)", text: "#fff" },
};

export function collectTypedRoleBadges(
  byType: MemberDossier["owned_pages_by_type"],
): Array<{ type: OwnedPageType; count: number; label: string }> {
  return TYPE_RENDER_ORDER.flatMap((type) => {
    const count = byType[type];
    if (count <= 0) return [];
    const labels = TYPE_LABELS[type];
    return [
      {
        type,
        count,
        label: count === 1 ? labels.singular : labels.plural,
      },
    ];
  });
}

export function TypedRoleBadge({
  type,
  count,
  label,
}: {
  type: OwnedPageType;
  count: number;
  label: string;
}) {
  const palette = TYPE_CHIP_STYLE[type];
  return (
    <span
      className="bcc-mono px-1.5 py-[2px]"
      style={{
        background: palette.bg,
        color: palette.text,
        fontSize: "9px",
        letterSpacing: "0.18em",
      }}
    >
      {count} {label}
    </span>
  );
}

export function PrimaryLocalChip({
  local,
}: {
  local: NonNullable<MemberDossier["primary_local"]>;
}) {
  return (
    <span
      className="bcc-mono inline-flex items-center gap-1 border border-cardstock-edge/40 px-1.5 py-[2px] text-ink"
      style={{ fontSize: "9px", letterSpacing: "0.16em" }}
    >
      {local.number !== null && <span className="text-safety">№{local.number}</span>}
      <span className="truncate">{local.name.toUpperCase()}</span>
    </span>
  );
}
