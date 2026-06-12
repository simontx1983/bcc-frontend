/**
 * GroupDetailShell — the unified FileRail + PageHero + GroupTabs shell
 * shared by every group-style route:
 *
 *   /groups/[slug]                          (urlBase: undefined → internal tabs)
 *   /communities/[slug] + /about + /members (urlBase: "/communities/{slug}")
 *   /locals/[slug]                          (urlBase: undefined; pass localActions)
 *
 * Server component. Composes:
 *   1. FileRail            — top status strip (FLOOR // KIND  {SLUG}  ·  FILE / OPEN)
 *   2. <h1> stencil title  — group.name (matches /u/[handle]'s page title)
 *   3. PageHero            — GroupCard in card slot; actions slot caller-supplied
 *   4. GroupTabs           — Stream / Members / About
 *
 * Mirrors the EntityProfile shape so /groups, /communities, /locals
 * read as one product with /u, /v, /p, /c.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

import { ShareButton } from "@/components/common/ShareButton";
import { FileRail } from "@/components/layout/FileRail";
import { GroupAboutPanel } from "@/components/groups/GroupAboutPanel";
import { GroupCard } from "@/components/groups/GroupCard";
import { GroupFeedSection } from "@/components/groups/GroupFeedSection";
import { GroupMembersStrip } from "@/components/groups/GroupMembersStrip";
import { GroupMembershipStrip } from "@/components/groups/GroupMembershipStrip";
import { GroupTabs, type GroupTabKey } from "@/components/groups/GroupTabs";
import { PageHero } from "@/components/layout/PageHero";
import type { GroupDetailResponse } from "@/lib/api/types";

const KIND_RAIL_LABEL: Record<GroupDetailResponse["type"], string> = {
  nft:    "HOLDERS",
  local:  "LOCAL",
  system: "SYSTEM",
  user:   "COMMUNITY",
};

const STATUS_BY_PRIVACY: Record<GroupDetailResponse["privacy"], string> = {
  open:   "OPEN",
  closed: "CLOSED",
  secret: "SECRET",
};

export interface GroupDetailShellProps {
  group: GroupDetailResponse;
  /** Active tab on mount. URL-aware route shells pass the segment-
   *  matching value; internal-state callers default to "stream". */
  initialTab?: GroupTabKey;
  /** Optional URL prefix for community sub-routes — when set, the tab
   *  strip pushes /communities/{slug}/<segment> on click. Omit on
   *  /groups/[slug] + /locals/[slug] for internal-state tabs. */
  urlBase?: string;
  /**
   * Action cluster rendered in PageHero's `actions` slot. Defaults to
   * `<GroupMembershipStrip>` for /groups + /communities; /locals passes
   * its own `<LocalMembershipControls>` since locals support set/clear
   * primary semantics plain groups don't.
   */
  actions?: ReactNode;
  /**
   * Optional back-link breadcrumb rendered above the h1. Restores the
   * `← COMMUNITIES` / `← GROUPS` / `← LOCALS` affordance from the
   * pre-unification pages. Both `backHref` and `backLabel` must be
   * supplied; omit both to hide the breadcrumb.
   */
  backHref?: string;
  backLabel?: string;
  /**
   * App-relative path to share (leading slash, no origin), e.g.
   * "/communities/{slug}". Built by the route the viewer is on — the shell
   * is shared across /communities, /groups, and /locals, so the share +
   * canonical surface differs per route and is threaded down rather than
   * derived from a single `links.self`. Omit to hide the Share button.
   */
  sharePath?: string;
}

export function GroupDetailShell({
  group,
  initialTab = "stream",
  urlBase,
  actions,
  backHref,
  backLabel,
  sharePath,
}: GroupDetailShellProps) {
  const actionCluster =
    actions !== undefined ? actions : <GroupMembershipStrip group={group} />;

  const showBreadcrumb =
    backHref !== undefined && backHref !== "" &&
    backLabel !== undefined && backLabel !== "";

  const showShare = sharePath !== undefined && sharePath !== "";

  return (
    <main className="pb-24">
      <FileRail
        kind={KIND_RAIL_LABEL[group.type]}
        subject={`@${group.slug.toUpperCase()}`}
        fileNumber={String(group.id).padStart(4, "0")}
        status={STATUS_BY_PRIVACY[group.privacy]}
      />

      {/* §J page title — large stencil name. Same vocabulary as
          /u/[handle] / EntityProfile so the platform reads as one
          product. The trading-card-style GroupCard sits below in the
          PageHero `card` slot; this is the page-level identifier. */}
      <header className="mx-auto mt-8 max-w-[1440px] px-4 sm:px-7">
        {showBreadcrumb && (
          <Link
            href={backHref as Route}
            className="bcc-mono inline-block text-cardstock-deep hover:text-cardstock"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            ← {backLabel?.toUpperCase()}
          </Link>
        )}
        {/* Title row — stencil name on the left, Share on the right.
            Group/community/local detail pages are a shareable surface for
            any viewer who can see them; the page itself owns the privacy
            gate, so a Share button on a page you're already looking at is
            fine. The share path is the route the viewer is on (threaded in
            as `sharePath`) — the shell is reused across three routes, so we
            don't derive it from a single `links.self`. */}
        <div
          className={
            "flex items-start justify-between gap-4 " +
            (showBreadcrumb ? "mt-4" : "")
          }
        >
          <h1
            className="bcc-stencil text-cardstock leading-[0.92]"
            style={{ fontSize: "clamp(1.75rem, 5.5vw, 4.5rem)", wordBreak: "break-word" }}
          >
            {group.name}
          </h1>
          {showShare && (
            <div className="shrink-0 pt-1">
              <ShareButton
                path={sharePath}
                title={group.name}
                ariaLabel={`Share ${group.name}`}
              />
            </div>
          )}
        </div>
        <p
          className="bcc-mono mt-3 text-safety"
          style={{ fontSize: "11px", letterSpacing: "0.18em" }}
        >
          @{group.slug}
        </p>
      </header>

      <section className="mt-8">
        <PageHero
          card={<GroupCard group={group} />}
          actions={
            <div
              className="bcc-stage-reveal flex flex-col gap-3"
              style={{ ["--stagger" as string]: "120ms" }}
            >
              {actionCluster}
            </div>
          }
        />
      </section>

      <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-7">
        <GroupTabs
          initialTab={initialTab}
          {...(urlBase !== undefined ? { urlBase } : {})}
          streamPanel={<GroupFeedSection group={group} />}
          membersPanel={<GroupMembersStrip group={group} />}
          aboutPanel={<GroupAboutPanel group={group} />}
        />
      </section>
    </main>
  );
}
