/**
 * GroupDetailShell — the community / Hall detail page, on the ONE shared
 * detail layout (Site Structure A §12, hero option B):
 *
 *   /groups/[slug]                          (urlBase: undefined → internal tabs)
 *   /communities/[slug] + /about + /members (urlBase: "/communities/{slug}";
 *                                            a Hall also passes its actions,
 *                                            side blocks and chain panels —
 *                                            see community-detail)
 *
 * Server component. Composes:
 *   1. FileRail      — top status strip (FLOOR // KIND  {SLUG}  ·  FILE / OPEN)
 *   2. DetailHeader  — avatar · the card's kind word · name · @slug · chips
 *                      (access, a holder group's holding requirement for a
 *                      non-member, chain, verification) · membership
 *                      actions · Share · the card's counts
 *   3. DetailBody    — GroupTabs (Stream / About / Members [+ a Hall's
 *                      Collections / Validators]) beside the side column
 *                      (the page's own blocks · a holder group's
 *                      Collection · About · Facts)
 *
 * The trading card is not in the header (option B, Phillip 2026-11-25); it
 * stays on the Communities lists. Join lives in the header's actions, as it
 * did beside the card. What the card's back said about a holder group's
 * collection moves to the Collection block, so nothing is lost with it.
 *
 * Server component: the card rules it shares come from the hook-free
 * modules (card-face-stats, community-access), never from a card component.
 */

import type { Route } from "next";
import type { ReactNode } from "react";

import { cardFaceStats, cardHeaderWord } from "@/components/cards/card-face-stats";
import { communityAccessLabel, holdingRequirement } from "@/components/cards/community-access";
import { ShareButton } from "@/components/common/ShareButton";
import { DetailBody, DetailHeader, DetailPage, SideBlock } from "@/components/detail/DetailLayout";
import { GroupAboutPanel } from "@/components/groups/GroupAboutPanel";
import { GroupFeedSection } from "@/components/groups/GroupFeedSection";
import { GroupMembershipAdmin } from "@/components/groups/GroupMembershipAdmin";
import { GroupMembersStrip } from "@/components/groups/GroupMembersStrip";
import { GroupMembershipStrip } from "@/components/groups/GroupMembershipStrip";
import { GroupTabs, type GroupTabKey } from "@/components/groups/GroupTabs";
import { Avatar } from "@/components/identity/Avatar";
import { FileRail } from "@/components/layout/FileRail";
import type { GroupDetailResponse } from "@/lib/api/types";
import { communityChainLabel } from "@/lib/communities/chain-catalog";

const KIND_RAIL_LABEL: Record<GroupDetailResponse["type"], string> = {
  nft:    "HOLDERS",
  validator: "DELEGATORS",
  hall:   "HALL",
  system: "SYSTEM",
  user:   "COMMUNITY",
};

const STATUS_BY_PRIVACY: Record<GroupDetailResponse["privacy"], string> = {
  open:   "OPEN",
  closed: "CLOSED",
  secret: "SECRET",
};

/** A URL the server actually sent (null, undefined and "" all mean none). */
function presentUrl(url: string | null | undefined): string | null {
  return url !== null && url !== undefined && url.trim() !== "" ? url : null;
}

/** The card family's colour for a community (CardFactory's KIND_TO_COLOR_VAR). */
const COMMUNITY_COLOR = "var(--kind-community)";

export interface GroupDetailShellProps {
  group: GroupDetailResponse;
  /** Active tab on mount. URL-aware route shells pass the segment-
   *  matching value; internal-state callers default to "stream". */
  initialTab?: GroupTabKey;
  /** Optional URL prefix for community sub-routes — when set, the tab
   *  strip pushes /communities/{slug}/<segment> on click. Omit on
   *  /groups/[slug] for internal-state tabs. */
  urlBase?: string;
  /**
   * The header's action cluster. Defaults to `<GroupMembershipStrip>`; a
   * Hall passes its own `<HallMembershipControls>` since halls support
   * set/clear primary semantics plain groups don't.
   */
  actions?: ReactNode;
  /**
   * Optional back link above the header (`← COMMUNITIES` / `← HALLS`).
   * Both must be supplied; omit both to hide it.
   */
  backHref?: string;
  backLabel?: string;
  /**
   * App-relative path to share (leading slash, no origin), e.g.
   * "/communities/{slug}". Built by the route the viewer is on. Omit to
   * hide the Share button.
   */
  sharePath?: string;
  /**
   * Hall-only tab panels. Passing one adds its tab to the strip; omitting
   * it leaves the strip at Stream / About / Members.
   */
  collectionsPanel?: ReactNode;
  validatorsPanel?: ReactNode;
  /**
   * Optional content appended INSIDE the About tab, below GroupAboutPanel.
   * Halls pass their chain-identity + "About this chain" block here.
   */
  aboutSupplement?: ReactNode;
  /** Extra side-column blocks for this page (e.g. a Hall's "Your status"). */
  side?: ReactNode;
}

export function GroupDetailShell({
  group,
  initialTab = "stream",
  urlBase,
  actions,
  backHref,
  backLabel,
  sharePath,
  collectionsPanel,
  validatorsPanel,
  aboutSupplement,
  side,
}: GroupDetailShellProps) {
  // F-388: on the community sub-routes the strip can point an owner or
  // manager at the Members tab's requests block.
  const actionCluster =
    actions !== undefined ? (
      actions
    ) : (
      <GroupMembershipStrip
        group={group}
        {...(urlBase !== undefined ? { membersHref: `${urlBase}/members` } : {})}
      />
    );

  const showBack = backHref !== undefined && backHref !== "" && backLabel !== undefined && backLabel !== "";
  const showShare = sharePath !== undefined && sharePath !== "";
  const description = group.description?.trim() ?? "";
  const access = communityAccessLabel(group);
  // The chain's name from the catalog ("Cosmos Hub"), the slug only when
  // the catalog has none — as the card back says it.
  const chain =
    group.chain_tag !== null && group.chain_tag !== ""
      ? (communityChainLabel(group.chain_tag) ?? group.chain_tag)
      : null;
  const requirement = holdingRequirement(group.collection_stats);
  // The barrier is for someone outside: a member already holds enough
  // (the card's standing strip draws the same line).
  const showRequirementChip = requirement !== null && group.viewer_membership?.is_member !== true;

  return (
    <DetailPage>
      <FileRail
        kind={KIND_RAIL_LABEL[group.type]}
        subject={`@${group.slug.toUpperCase()}`}
        fileNumber={String(group.id).padStart(4, "0")}
        status={STATUS_BY_PRIVACY[group.privacy]}
      />

      <DetailHeader
        avatar={
          <Avatar
            avatarUrl={presentUrl(group.image_url) ?? presentUrl(group.card.crest.image_url)}
            handle={group.slug}
            displayName={group.name}
            size="lg"
          />
        }
        kind={cardHeaderWord(group.card)}
        kindColor={COMMUNITY_COLOR}
        name={group.name}
        handle={group.slug}
        chips={
          <>
            <Chip>{access}</Chip>
            {showRequirementChip && <Chip>{requirement}</Chip>}
            {chain !== null && <Chip>{chain}</Chip>}
            {group.verification !== null && <Chip verified>{group.verification.label}</Chip>}
          </>
        }
        actions={actionCluster}
        {...(showShare
          ? { share: <ShareButton path={sharePath} title={group.name} ariaLabel={`Share ${group.name}`} /> }
          : {})}
        stats={cardFaceStats(group.card)}
        {...(showBack ? { backHref: backHref as Route, backLabel } : {})}
      />

      <DetailBody
        main={
          <GroupTabs
            initialTab={initialTab}
            {...(urlBase !== undefined ? { urlBase } : {})}
            streamPanel={<GroupFeedSection group={group} />}
            membersPanel={
              // F-272 (b): owners / managers manage requests and invitations
              // above the roster; everyone else sees the roster alone (the
              // admin block renders nothing for them).
              <div className="flex flex-col gap-8">
                <GroupMembershipAdmin group={group} />
                <GroupMembersStrip group={group} />
              </div>
            }
            aboutPanel={
              // Halls append their chain block below the group's own About
              // content; other kinds render GroupAboutPanel alone.
              aboutSupplement !== undefined ? (
                <div className="flex flex-col gap-6">
                  <GroupAboutPanel group={group} />
                  {aboutSupplement}
                </div>
              ) : (
                <GroupAboutPanel group={group} />
              )
            }
            {...(collectionsPanel !== undefined ? { collectionsPanel } : {})}
            {...(validatorsPanel !== undefined ? { validatorsPanel } : {})}
          />
        }
        side={
          <>
            {side}
            {group.collection_stats !== null && (
              <CollectionBlock stats={group.collection_stats} requirement={requirement} />
            )}
            {description !== "" && (
              <SideBlock title="About">
                <p className="line-clamp-6 text-[15px] leading-relaxed text-bcc-text-secondary">{description}</p>
              </SideBlock>
            )}
            <SideBlock title="Facts">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                <dt className="text-bcc-text-secondary">Access</dt>
                <dd>{access}</dd>
                {chain !== null && (
                  <>
                    <dt className="text-bcc-text-secondary">Chain</dt>
                    <dd>{chain}</dd>
                  </>
                )}
                {group.verification !== null && (
                  <>
                    <dt className="text-bcc-text-secondary">Verified</dt>
                    <dd>{group.verification.label}</dd>
                  </>
                )}
              </dl>
            </SideBlock>
          </>
        }
      />
    </DetailPage>
  );
}

/**
 * A holder group's collection, from the server's display strings verbatim
 * (§A2): the standard, holders and supply, the holding requirement and the
 * marketplace link the card's back carried. Prices (floor, volume) and
 * sale data (listed, royalty) stay off the page: BCC never puts price
 * forward (Phillip). A row the server sends null for is left out.
 */
function CollectionBlock({
  stats,
  requirement,
}: {
  stats: NonNullable<GroupDetailResponse["collection_stats"]>;
  requirement: string | null;
}) {
  const rows: Array<{ label: string; value: string }> = [];
  if (stats.token_standard !== null) rows.push({ label: "Standard", value: stats.token_standard });
  if (stats.holders_display !== null) rows.push({ label: "Holders", value: stats.holders_display });
  if (stats.supply_display !== null) rows.push({ label: "Supply", value: stats.supply_display });
  if (requirement !== null) rows.push({ label: "To join", value: requirement });

  if (rows.length === 0 && stats.marketplace === null) return null;

  return (
    <SideBlock title="Collection">
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-bcc-text-secondary">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {stats.marketplace !== null && (
        <a
          href={stats.marketplace.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bcc-mono mt-2 inline-flex min-h-[44px] items-center text-[12px] tracking-[0.12em] text-bcc-text underline decoration-[var(--bcc-accent-indicator)] underline-offset-4"
        >
          View on {stats.marketplace.label} ↗
        </a>
      )}
    </SideBlock>
  );
}

/** A plain fact chip in the header (no dot: a dot means trust). */
function Chip({ children, verified = false }: { children: ReactNode; verified?: boolean }) {
  return (
    <span
      className="bcc-mono rounded-full border px-2.5 py-1"
      style={{
        fontSize: "10px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        borderColor: verified ? "var(--verified)" : "var(--bcc-border-strong)",
        color: verified ? "var(--verified)" : "var(--bcc-text-secondary)",
      }}
    >
      {children}
    </span>
  );
}
