"use client";

/**
 * EligibleCommunitiesModal — post-auth activation moment for §4.7.1
 * NFT-gated communities.
 *
 * Triggered passively from the global providers tree: as soon as the
 * user is authenticated AND the GET /me/holder-groups response shows
 * a non-empty `eligible_to_join` bucket, this modal opens — once per
 * session, dismissable.
 *
 * Trigger rules (all required):
 *   1. NextAuth session === "authenticated"
 *   2. eligible_to_join.length > 0
 *   3. user has not dismissed in this sessionStorage
 *   4. modal not already showing
 *
 * "Skip" semantics (locked, see settings/communities/CLAUDE-style design):
 *   - Skip / Esc / click-outside set the dismissal flag and close.
 *   - Skip is NOT a leave — it does NOT call POST /:id/leave. Calling
 *     /leave on never-joined groups would record a 90-day opt-out the
 *     user never asked for. Skip is "show me later" only.
 *
 * Per-row Join uses the existing useJoinHolderGroupMutation — same
 * pipeline as the settings panel, so the row flips out of the
 * eligible bucket on success and the modal closes when empty.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import {
  useJoinHolderGroupMutation,
  useMyHolderGroups,
} from "@/hooks/useHolderGroups";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type { GroupActivity, HolderGroupItem } from "@/lib/api/types";

const SESSION_DISMISS_KEY = "bcc.communities.dismissed";

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

function readDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  } catch {
    // sessionStorage can throw in private-browsing edge cases — bias
    // toward showing the modal once and letting the user dismiss it
    // explicitly rather than accidentally suppressing it.
    return false;
  }
}

function writeDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch {
    // Non-fatal — worst case, user sees the modal again next page nav.
  }
}

/**
 * Outer component — handles auth + dismiss gating WITHOUT firing the
 * holder-groups query. The query only mounts via the inner authed
 * component, so signed-out visitors don't hit /me/holder-groups (401)
 * and dismissed sessions don't hit it either.
 */
export function EligibleCommunitiesModal() {
  const { status } = useSession();
  const [dismissed, setDismissed] = useState<boolean>(true);
  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (status !== "authenticated") return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return <EligibleCommunitiesModalInner onDismiss={handleDismiss} />;
}

/**
 * Inner component — only mounts when the user is authed and hasn't
 * dismissed. This is where the holder-groups query lives, so the
 * authed/dismissed gates above protect it from running unnecessarily.
 */
function EligibleCommunitiesModalInner({ onDismiss }: { onDismiss: () => void }) {
  const listQuery = useMyHolderGroups();
  const eligible = listQuery.data?.eligible_to_join ?? [];

  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (eligible.length > 0) setOpen(true);
  }, [eligible.length]);

  // Auto-close when the bucket drains (user joined the last one).
  // Routing through onDismiss writes the sessionStorage flag so a
  // subsequent eligibility regen (chain RPC re-derives) doesn't pop
  // the modal again on the next nav.
  useEffect(() => {
    if (open && eligible.length === 0) {
      onDismiss();
      setOpen(false);
    }
  }, [open, eligible.length, onDismiss]);

  const handleDismiss = () => {
    setOpen(false);
    onDismiss();
  };

  // ESC dismisses (matches click-outside / Skip).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDismiss is stable for the lifetime of an open modal; re-binding on every render churns the listener
  }, [open]);

  if (!open) return null;
  if (eligible.length === 0) return null;

  return (
    <ModalShell title="Communities you qualify for" onClose={handleDismiss}>
      <ModalContent items={eligible} onSkip={handleDismiss} />
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal content
// ─────────────────────────────────────────────────────────────────────

interface ModalContentProps {
  items: HolderGroupItem[];
  /** Explicit Skip / Maybe-later — same dismissal as ESC / click-outside. */
  onSkip: () => void;
}

function ModalContent({ items, onSkip }: ModalContentProps) {
  const sorted = sortByHeat(items);
  const remaining = items.length;

  return (
    <>
      <header className="mb-6 pr-10">
        <p className="bcc-mono mb-2 text-[10px] tracking-[0.24em] text-blueprint">
          ELIGIBLE COMMUNITIES
        </p>
        <h2 className="bcc-stencil text-2xl text-ink md:text-3xl">
          You already qualify
        </h2>
        <p className="font-serif mt-2 italic text-ink-soft">
          {remaining === 1
            ? "You hold the gating NFT for this community. Join now or skip and find it later in settings."
            : `You hold the gating NFT for ${remaining} communities. Join now or skip and find them later in settings.`}
        </p>
      </header>

      <ul className="bcc-panel divide-y divide-cardstock-edge/60">
        {sorted.map((item) => (
          <EligibleRow key={item.group_id} item={item} />
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="bcc-mono inline-flex items-center px-4 py-2 text-[11px] tracking-[0.18em] text-ink-soft hover:text-ink"
        >
          MAYBE LATER
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-row layout (slim copy of CommunitiesList row shape — kept inline
// to avoid coupling settings UI to auth flow)
// ─────────────────────────────────────────────────────────────────────

function EligibleRow({ item }: { item: HolderGroupItem }) {
  const mutation = useJoinHolderGroupMutation();
  // Substitute friendly copy for the per-user Throttle 429 emitted by
  // HolderGroupsEndpoint::postJoin. Other server-typed errors fall
  // through to the canonical .message verbatim.
  const errorMessage = mutation.error
    ? mutation.error.code === "bcc_rate_limited"
      ? "Slow down — too many join attempts. Wait a minute."
      : mutation.error.message
    : null;
  const collectionName = item.collection.name ?? item.name;

  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {item.collection.image_url !== null && item.collection.image_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element -- collection art is a remote NFT thumbnail; we haven't taken on a domain allowlist for next/image
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
          {errorMessage !== null && (
            <p
              role="alert"
              className="bcc-mono mt-1 text-[10px] tracking-[0.12em] text-safety"
            >
              {errorMessage}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          mutation.reset();
          mutation.mutate(item.group_id);
        }}
        disabled={mutation.isPending}
        className="bcc-mono inline-flex items-center border-2 border-ink bg-ink px-4 py-2 text-[11px] tracking-[0.18em] text-cardstock transition hover:bg-ink/80 disabled:opacity-60"
      >
        {mutation.isPending ? "JOINING…" : "JOIN"}
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ModalShell — local copy of the existing per-modal pattern (Composer,
// OpenDisputeModal, PanelVoteModal, ClaimFlow). Adds reduced-motion
// awareness on the fade-in.
// ─────────────────────────────────────────────────────────────────────

interface ModalShellProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

/**
 * Synchronous read of the OS reduced-motion preference. Used to
 * initialize `mounted` so reduced-motion users skip the opacity-0 →
 * opacity-100 fade entirely (no one-frame flicker between hydration
 * and matchMedia resolution). The hook below still drives the className
 * branch — this is just a flicker-free initial state.
 *
 * Modal HTML is never in the SSR payload (only mounts after `open`
 * goes true via client effects), so a server/client divergence on
 * this initializer can't cause a hydration mismatch.
 */
function getInitialMotionPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ModalShell({ title, children, onClose }: ModalShellProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(getInitialMotionPreference);
  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    // Trigger fade-in next frame so the transition runs.
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, [reducedMotion]);

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className={
        "fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm md:items-center " +
        (reducedMotion
          ? ""
          : "transition-opacity duration-200 " + (mounted ? "opacity-100" : "opacity-0"))
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bcc-panel relative w-full max-w-2xl p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bcc-mono absolute right-4 top-4 text-cardstock-deep hover:text-ink"
        >
          ESC
        </button>
        {children}
      </div>
    </div>
  );
}
