"use client";

/**
 * CommunitiesList — /settings/communities content.
 *
 * Three buckets pre-filtered server-side (§4.7.1):
 *   1. Joined          — viewer's current communities, leave action
 *   2. Eligible        — viewer holds the gating NFT but isn't a member,
 *                        join action. Sorted by heat (hot → warm → cold,
 *                        then posts_last_7d desc) per contract §4.7.1
 *                        line 1510 — anti-ghost-town.
 *   3. Opted-out       — viewer left (Join offered, F-158) or was
 *                        mod-removed (no action). `opt_out_kind` absent
 *                        is treated as mod-removed.
 *
 * Plus an auto-join preference toggle at the top. Toggling ON triggers
 * a synchronous reconcile sweep server-side; the reconciled count is
 * surfaced as a one-shot success line.
 *
 * Eligibility is server-authoritative — this component never decides
 * who can join what, only renders what the server bucketed and forwards
 * mutations. Errors come back as typed BccApiError and the `message`
 * field is rendered verbatim (it's the unlock_hint per §4.7.1).
 */

import { useState } from "react";

import {
  useHolderGroupPreferences,
  useJoinHolderGroupMutation,
  useMyHolderGroups,
  useUpdateHolderGroupPreferences,
} from "@/hooks/useHolderGroups";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { GroupActionButton } from "@/components/groups/GroupActionButton";
import { HolderLeaveConfirm } from "@/components/groups/HolderLeaveConfirm";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import type { GroupActivity, HolderGroupItem } from "@/lib/api/types";

import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

const HEAT_ORDER: Record<GroupActivity["heat"], number> = {
  hot: 0,
  warm: 1,
  cold: 2,
};

function sortByHeat(items: HolderGroupItem[]): HolderGroupItem[] {
  return [...items].sort((a, b) => {
    const heatDelta =
      HEAT_ORDER[a.activity.heat] - HEAT_ORDER[b.activity.heat];
    if (heatDelta !== 0) return heatDelta;
    return b.activity.posts_last_7d - a.activity.posts_last_7d;
  });
}

export function CommunitiesList() {
  const listQuery = useMyHolderGroups();

  if (listQuery.isPending) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-bcc-text-secondary">Loading communities…</p>
      </div>
    );
  }

  const failure = listQuery.isError ? (
    <div className="bcc-panel p-6">
      <LoadFailure
        /* §γ — copy is keyed on err.code; never render err.message. */
        message={humanizeCode(
          listQuery.error,
          {
            bcc_unauthorized: "Sign in to see your communities.",
            bcc_rate_limited: "Loading too fast — give it a moment and try again.",
            bcc_unavailable: "Communities are temporarily unavailable. Try again shortly.",
          },
          "Couldn't load communities. Try again in a moment.",
        )}
        // The list query only — `updateMutation`'s error is a write
        // failure and keeps its own inline message further down.
        onRetry={() => void listQuery.refetch()}
      />
    </div>
  ) : null;

  // Only a first-load failure, or a REFRESH the server refused, may
  // replace the page. Every join and leave invalidates this query, so a
  // blanket `isError` meant one failed refetch erased all three sections
  // and the auto-join preference above them.
  if (
    listQuery.isLoadingError ||
    (listQuery.isRefetchError && isPermissionDenial(listQuery.error))
  ) {
    return failure;
  }

  const { joined, eligible_to_join, opted_out } = listQuery.data;
  const eligibleSorted = sortByHeat(eligible_to_join);

  return (
    <div className="flex flex-col gap-10">
      {/* A failed REFRESH keeps the sections; the recovery sits on top. */}
      {failure}
      <AutoJoinPreference />

      <CommunitiesSection
        eyebrow="YOUR COMMUNITIES"
        title="Joined"
        blurb="Communities you're currently a member of. Leaving records a 90-day cooldown so the auto-join sweep doesn't re-add you."
        items={joined}
        emptyCopy="You haven't joined any holder communities yet. Eligible communities — if any — are listed below." /* cadence-pressure-guard:allow — neutral empty-state fact, no attest cadence */
        renderAction={(item) => <LeaveButton groupId={item.group_id} />}
      />

      <CommunitiesSection
        eyebrow="UNLOCK THESE"
        title="Eligible communities"
        blurb="You hold the gating NFT for these communities. Join now or flip auto-join above to join them all in one tap."
        items={eligibleSorted}
        emptyCopy="No eligible communities right now. Connect a wallet that holds verified NFTs and they'll show up here."
        renderAction={(item) => <JoinButton groupId={item.group_id} />}
      />

      <CommunitiesSection
        eyebrow="PREVIOUSLY LEFT"
        title="Opted out"
        blurb="Communities you left or were removed from. If you left, auto-join won't add you back for 90 days, but you can rejoin any time while you hold the NFT. If a moderator removed you, you can't rejoin."
        items={opted_out}
        emptyCopy="Nothing here. You haven't left any holder communities." /* cadence-pressure-guard:allow — neutral empty-state fact, no attest cadence */
        // Only a self-leave may rejoin. A missing kind (older backend) is
        // treated as a moderator removal: no Join, never a doomed 403.
        renderAction={(item) =>
          item.opt_out_kind === "left" ? <JoinButton groupId={item.group_id} /> : null
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Auto-join preference (top of page)
// ─────────────────────────────────────────────────────────────────────

function AutoJoinPreference() {
  const prefsQuery = useHolderGroupPreferences();
  const updateMutation = useUpdateHolderGroupPreferences();
  const [reconciledHint, setReconciledHint] = useState<string | null>(null);

  const value = prefsQuery.data?.auto_join ?? false;
  const pending = prefsQuery.isPending || updateMutation.isPending;

  const handleToggle = (next: boolean) => {
    setReconciledHint(null);
    updateMutation.mutate(
      { auto_join: next },
      {
        onSuccess: (data) => {
          if (data.auto_join && data.reconciled.joined > 0) {
            setReconciledHint(
              data.reconciled.joined === 1
                ? "Joined 1 eligible community."
                : `Joined ${data.reconciled.joined} eligible communities.`
            );
          }
        },
      }
    );
  };

  return (
    <section>
      <SettingsSectionHeader
        eyebrow="AUTO-JOIN"
        title="Join eligible communities automatically"
        blurb="When ON, the daily reconcile sweep enrolls you in any community where you hold the gating NFT. Toggle it now and we'll catch you up immediately — no waiting for the cron tick."
      />
      <div className="bcc-panel mt-4 flex items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="bcc-stencil text-bcc-text">Auto-join is {value ? "ON" : "OFF"}</p>
          <p className="bcc-mono mt-1 text-[11px] text-bcc-text-secondary">
            Default is OFF — we suggest, you decide.
          </p>
        </div>
        <ToggleSwitch
          label="Auto-join eligible communities"
          value={value}
          pending={pending}
          onChange={handleToggle}
        />
      </div>

      {reconciledHint !== null && (
        <p
          role="status"
          className="bcc-mono mt-3 text-[11px] tracking-[0.16em] text-blueprint"
        >
          {reconciledHint}
        </p>
      )}

      {updateMutation.isError && (
        <p role="alert" className="bcc-mono mt-3 text-[11px] text-bcc-text-error">
          {/* §γ — copy is keyed on err.code; never render err.message. */}
          {humanizeCode(
            updateMutation.error,
            {
              bcc_rate_limited: "Slow down — preference saved too many times. Wait a minute.",
              bcc_unauthorized: "Sign in to change this preference.",
            },
            "Couldn't save preference. Try again.",
          )}
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-bucket section
// ─────────────────────────────────────────────────────────────────────

interface CommunitiesSectionProps {
  eyebrow: string;
  title: string;
  blurb: string;
  items: HolderGroupItem[];
  emptyCopy: string;
  renderAction: (item: HolderGroupItem) => React.ReactNode;
}

function CommunitiesSection({
  eyebrow,
  title,
  blurb,
  items,
  emptyCopy,
  renderAction,
}: CommunitiesSectionProps) {
  return (
    <section>
      <SettingsSectionHeader eyebrow={eyebrow} title={title} blurb={blurb} />

      {items.length === 0 ? (
        <div className="bcc-panel mt-4 p-6">
          <p
            className="bcc-mono mb-3 text-bcc-text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            NONE ON FILE
          </p>
          <p className="font-serif italic text-bcc-text-secondary">{emptyCopy}</p>
        </div>
      ) : (
        <ul className="bcc-panel mt-4 divide-y divide-bcc-border">
          {items.map((item) => (
            <CommunityRow
              key={item.group_id}
              item={item}
              action={renderAction(item)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-row layout
// ─────────────────────────────────────────────────────────────────────

interface CommunityRowProps {
  item: HolderGroupItem;
  action: React.ReactNode;
}

function CommunityRow({ item, action }: CommunityRowProps) {
  const collectionName = item.collection.name ?? item.name;

  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* Collection art is a remote NFT thumbnail (no next/image domain
            allowlist). F-187: gateway → ipfs.io fallback → initials. */}
        <FallbackImg
          src={item.collection.image_url}
          fallbackSrc={item.collection.image_fallback_url}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
          className="h-9 w-9 shrink-0 rounded-full border border-bcc-border object-cover"
          placeholder={
            <div
              aria-hidden
              className="bcc-mono flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-bcc-border bg-bcc-surface-hover text-[10px] text-bcc-text-secondary"
            >
              {collectionName.slice(0, 2).toUpperCase()}
            </div>
          }
        />

        <div className="min-w-0">
          <p className="bcc-stencil truncate text-bcc-text">{item.name}</p>
          <p className="bcc-mono mt-0.5 flex flex-wrap items-center gap-2 truncate text-[11px] text-bcc-text-secondary">
            <span>{item.member_count.toLocaleString()} members</span>
            <span aria-hidden className="text-bcc-text-muted">·</span>
            <HeatBadge activity={item.activity} />
            <span aria-hidden className="text-bcc-text-muted">·</span>
            <VerificationBadge label={item.verification.label} />
          </p>
        </div>
      </div>

      {action}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Action buttons (with inline error surfacing for unlock_hint copy)
// ─────────────────────────────────────────────────────────────────────

function JoinButton({ groupId }: { groupId: number }) {
  const mutation = useJoinHolderGroupMutation();

  // §γ — copy is keyed on err.code; never render err.message.
  const errorMessage = mutation.error
    ? humanizeCode(
        mutation.error,
        {
          bcc_rate_limited: "Slow down — too many join attempts. Wait a minute.",
          bcc_unauthorized: "Sign in to join this community.",
          bcc_permission_denied: "You don't meet this community's join requirements yet.",
        },
        "Couldn't join this community. Try again.",
      )
    : null;

  return (
    <GroupActionButton
      groupId={groupId}
      label="JOIN"
      pendingLabel="JOINING…"
      isPending={mutation.isPending}
      errorMessage={errorMessage}
      onClick={() => {
        mutation.reset();
        mutation.mutate(groupId);
      }}
    />
  );
}

// Holder leave starts a 90-day cooldown, so it confirms first.
function LeaveButton({ groupId }: { groupId: number }) {
  return (
    <HolderLeaveConfirm
      groupId={groupId}
      // §γ — copy is keyed on err.code; never render err.message.
      humanizeError={(err) =>
        humanizeCode(
          err,
          {
            bcc_rate_limited: "Slow down — too many leave attempts. Wait a minute.",
            bcc_unauthorized: "Sign in to leave this community.",
          },
          "Couldn't leave this community. Try again.",
        )
      }
    />
  );
}
