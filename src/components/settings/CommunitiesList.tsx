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
 *   3. Opted-out       — viewer left or was mod-removed (read-only)
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
  useLeaveHolderGroupMutation,
  useMyHolderGroups,
  useUpdateHolderGroupPreferences,
} from "@/hooks/useHolderGroups";
import { GroupActionButton } from "@/components/groups/GroupActionButton";
import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type { GroupActivity, HolderGroupItem } from "@/lib/api/types";

import { SettingsSectionHeader } from "@/app/settings/_components/SettingsSectionHeader";

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
        <p className="bcc-mono text-ink-soft">Loading communities…</p>
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="bcc-panel p-6">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load communities: {listQuery.error.message}
        </p>
      </div>
    );
  }

  const { joined, eligible_to_join, opted_out } = listQuery.data;
  const eligibleSorted = sortByHeat(eligible_to_join);

  return (
    <div className="flex flex-col gap-10">
      <AutoJoinPreference />

      <CommunitiesSection
        eyebrow="YOUR COMMUNITIES"
        title="Joined"
        blurb="Communities you're currently a member of. Leaving records a 90-day cooldown so the auto-join sweep doesn't re-add you."
        items={joined}
        emptyCopy="You haven't joined any holder communities yet. Eligible communities — if any — are listed below."
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
        blurb="Communities you left or were removed from. Cooldown clears in 90 days for self-leaves; mod-removals are permanent."
        items={opted_out}
        emptyCopy="Nothing here. You haven't left any holder communities."
        renderAction={() => null}
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
          <p className="bcc-stencil text-ink">Auto-join is {value ? "ON" : "OFF"}</p>
          <p className="bcc-mono mt-1 text-[11px] text-ink-soft">
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
        <p role="alert" className="bcc-mono mt-3 text-[11px] text-safety">
          {updateMutation.error.code === "bcc_rate_limited"
            ? "Slow down — preference saved too many times. Wait a minute."
            : `Couldn't save preference: ${updateMutation.error.message}`}
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
            className="bcc-mono mb-3 text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            NONE ON FILE
          </p>
          <p className="font-serif italic text-ink-soft">{emptyCopy}</p>
        </div>
      ) : (
        <ul className="bcc-panel mt-4 divide-y divide-cardstock-edge/60">
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
        {item.collection.image_url !== null && item.collection.image_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element -- collection art is a remote NFT thumbnail; image optimization adds a domain-allowlist burden we haven't taken on yet
          <img
            src={item.collection.image_url}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full border border-cardstock-edge object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="bcc-mono flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cardstock-edge bg-cardstock-deep/40 text-[10px] text-ink-soft"
          >
            {collectionName.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="min-w-0">
          <p className="bcc-stencil truncate text-ink">{item.name}</p>
          <p className="bcc-mono mt-0.5 flex flex-wrap items-center gap-2 truncate text-[11px] text-ink-soft">
            <span>{item.member_count.toLocaleString()} members</span>
            <span aria-hidden className="text-cardstock-edge">·</span>
            <HeatBadge activity={item.activity} />
            <span aria-hidden className="text-cardstock-edge">·</span>
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

  // Substitute friendlier copy for the per-user Throttle 429; other
  // server-typed errors (e.g. bcc_permission_denied with an
  // unlock_hint) still render the canonical .message verbatim.
  const errorMessage = mutation.error
    ? mutation.error.code === "bcc_rate_limited"
      ? "Slow down — too many join attempts. Wait a minute."
      : mutation.error.message
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

function LeaveButton({ groupId }: { groupId: number }) {
  const mutation = useLeaveHolderGroupMutation();

  const errorMessage = mutation.error
    ? mutation.error.code === "bcc_rate_limited"
      ? "Slow down — too many leave attempts. Wait a minute."
      : mutation.error.message
    : null;

  return (
    <GroupActionButton
      groupId={groupId}
      label="LEAVE"
      pendingLabel="LEAVING…"
      isPending={mutation.isPending}
      errorMessage={errorMessage}
      onClick={() => {
        mutation.reset();
        mutation.mutate(groupId);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// ToggleSwitch — local copy of the accessible button-as-switch from
// PrivacySettingsForm. Inline rather than extracted because there are
// only two callers and extraction would introduce a shared-component
// surface area we don't otherwise need.
// ─────────────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  label: string;
  value: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}

function ToggleSwitch({ label, value, pending, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={pending}
      onClick={() => onChange(!value)}
      className={
        "relative inline-flex h-7 w-12 flex-shrink-0 items-center border-2 transition disabled:opacity-60 " +
        (value
          ? "border-ink bg-ink"
          : "border-cardstock-edge bg-cardstock-deep/40")
      }
    >
      <span
        aria-hidden
        className={
          "block h-4 w-4 transition-transform " +
          (value ? "translate-x-6 bg-cardstock" : "translate-x-1 bg-ink")
        }
      />
    </button>
  );
}
