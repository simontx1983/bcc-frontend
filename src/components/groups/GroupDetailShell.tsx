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
 *                      (privacy, chain, verification) · membership actions
 *                      · Share · the card's stats
 *   3. DetailBody    — GroupTabs (Stream / About / Members [+ a Hall's
 *                      Collections / Validators]) beside the side column
 *                      (About · Facts · any page-specific blocks)
 *
 * The trading card is not in the header (option B, Phillip 2026-11-25); it
 * stays on the Communities lists. Join lives in the header's actions, as it
 * did beside the card.
 */

import type { Route } from "next";
import type { ReactNode } from "react";

import { cardHeaderWord } from "@/components/cards/CardFrontFace";
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

/** Plain words for the Facts block and the privacy chip. */
const ACCESS_BY_PRIVACY: Record<GroupDetailResponse["privacy"], string> = {
  open:   "Open to anyone",
  closed: "Join by request",
  secret: "Invite only",
};

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
            avatarUrl={group.image_url ?? group.card.crest.image_url ?? null}
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
            <Chip>{ACCESS_BY_PRIVACY[group.privacy]}</Chip>
            {group.chain_tag !== null && group.chain_tag !== "" && <Chip>{group.chain_tag}</Chip>}
            {group.verification !== null && <Chip verified>{group.verification.label}</Chip>}
          </>
        }
        actions={actionCluster}
        {...(showShare
          ? { share: <ShareButton path={sharePath} title={group.name} ariaLabel={`Share ${group.name}`} /> }
          : {})}
        stats={group.card.stats}
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
            {description !== "" && (
              <SideBlock title="About">
                <p className="line-clamp-6 text-[15px] leading-relaxed text-bcc-text-secondary">{description}</p>
              </SideBlock>
            )}
            <SideBlock title="Facts">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                <dt className="text-bcc-text-secondary">Access</dt>
                <dd>{ACCESS_BY_PRIVACY[group.privacy]}</dd>
                {group.chain_tag !== null && group.chain_tag !== "" && (
                  <>
                    <dt className="text-bcc-text-secondary">Chain</dt>
                    <dd>{group.chain_tag}</dd>
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
