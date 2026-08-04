"use client";

/**
 * GroupTransferOwnership — Rank Phase 7 (§21.2, v1.62) owner control:
 * hand a User-kind (member-created) community to another ACTIVE member.
 *
 * Mounts inside GroupMembershipStrip's owner branch — the same spot the
 * `owner_cannot_leave` hint renders — and ONLY when the server says the
 * viewer is the owner (`can_leave.reason_code === "owner_cannot_leave"`)
 * of a `type === "user"` group. That's a server-derived signal, not a
 * client recomputation (§A2); the endpoint re-checks everything anyway.
 *
 * Receiver picker: reuses the §4.7.7 roster (useGroupMembers) — the
 * receiver MUST already be a member (membership is the consent proxy),
 * so the roster IS the candidate set. The owner's own row is excluded.
 *
 * Confirm dialog states the custody consequence for BOTH parties (30-day
 * cooldown re-arms on each side) before the mutation fires. On success:
 * the hook invalidates the roster + per-user groups panels, and this
 * component drives `router.refresh()` so the SSR'd detail view-model
 * re-fetches with the new owner (the control then unmounts because the
 * viewer stops being the owner).
 *
 * Old-backend tolerance: the transfer route doesn't exist pre-Phase-7 —
 * a 404 there falls into the generic error copy below.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useTransferGroupOwnershipMutation } from "@/hooks/useMyGroups";
import { humanizeCode } from "@/lib/api/errors";
import {
  BccApiError,
  type GroupDetailResponse,
  type GroupMember,
  type TransferGiverDenyReason,
  type TransferReceiverDenyReason,
} from "@/lib/api/types";

// ──────────────────────────────────────────────────────────────────────
// §γ deny copy — keyed on the stable machine `data.reason` of a 403
// `bcc_forbidden` (giver reasons bare, receiver reasons prefixed
// `receiver_`), never on message text. Receiver lines use "They …"
// phrasing so the owner understands the transfer TARGET is the blocker,
// not their own account. Plain state descriptions; no nudges.
// ──────────────────────────────────────────────────────────────────────

const TRANSFER_DENY_COPY: Record<
  TransferGiverDenyReason | TransferReceiverDenyReason,
  string
> = {
  // Giver-side (TransferGiverDenyReason)
  suspended: "Your account is suspended.",
  new_member: "Reach Apprentice rank to transfer a community.",
  in_recovery: "Community actions are paused while your rank is in recovery.",
  // Receiver-side (TransferReceiverDenyReason)
  receiver_suspended: "Their account is suspended.",
  receiver_new_member: "They need to be at least an Apprentice to receive a community.",
  receiver_below_neutral: "Their standing must be Neutral or better to receive a community.",
  receiver_in_recovery: "Their community actions are paused while their rank is in recovery.",
  receiver_cap_reached: "They already own the maximum number of communities for their rank.",
  receiver_cooldown_active: "They're inside the 30-day community cooldown.",
};

function isTransferDenyReason(
  value: unknown,
): value is TransferGiverDenyReason | TransferReceiverDenyReason {
  return typeof value === "string" && value in TRANSFER_DENY_COPY;
}

function humanizeTransferError(err: unknown): string {
  if (err instanceof BccApiError && err.code === "bcc_forbidden") {
    const reason = err.data?.["reason"];
    if (isTransferDenyReason(reason)) {
      return TRANSFER_DENY_COPY[reason];
    }
    return "This community can't be transferred right now.";
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in again to transfer this community.",
      bcc_not_found: "This community can't be transferred right now.",
      bcc_invalid_request:
        "The new owner must already be a member of this community.",
      bcc_rate_limited:
        "Too many transfer attempts — wait an hour and try again.",
      bcc_internal_error:
        "Couldn't transfer the community. Try again in a moment.",
    },
    "Couldn't transfer the community. Try again.",
  );
}

interface GroupTransferOwnershipProps {
  group: GroupDetailResponse;
}

export function GroupTransferOwnership({ group }: GroupTransferOwnershipProps) {
  const router = useRouter();
  const roster = useGroupMembers(group.id);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [transferred, setTransferred] = useState(false);

  const mutation = useTransferGroupOwnershipMutation({
    onSuccess: () => {
      setConfirming(false);
      setTransferred(true);
      // SSR'd detail page — refresh re-fetches the view-model with the
      // new owner; this control unmounts once the viewer isn't owner.
      router.refresh();
    },
  });

  // Candidate receivers = every ACTIVE roster row except the owner
  // (i.e. the viewer). The server re-validates membership + the full
  // receiver gate chain — this list is a picker, not an authorization.
  const candidates = useMemo<GroupMember[]>(
    () =>
      (roster.data?.pages ?? [])
        .flatMap((page) => page.items)
        .filter((member) => member.role !== "owner"),
    [roster.data],
  );

  const selected =
    selectedId !== null
      ? (candidates.find((member) => member.id === selectedId) ?? null)
      : null;

  const errorMessage = mutation.error
    ? humanizeTransferError(mutation.error)
    : null;

  if (transferred) {
    return (
      <div className="mt-4 border-t border-cardstock-edge/40 pt-4">
        <p
          role="status"
          className="bcc-mono text-[11px] tracking-[0.14em]"
          style={{ color: "var(--verified)" }}
        >
          Ownership transferred.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-cardstock-edge/40 pt-4">
      <h4
        className="bcc-mono text-ink-soft"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        TRANSFER OWNERSHIP
      </h4>
      <p
        className="mt-1 font-serif text-ink-soft"
        style={{ fontSize: "13px", lineHeight: 1.5, maxWidth: "44ch" }}
      >
        Hand this community to another member. Both of you start a 30-day
        cooldown on creating, receiving, or transferring communities.
      </p>

      {roster.isLoading && (
        <p className="bcc-mono mt-3 text-[10px] tracking-[0.16em] text-ink-soft">
          Loading members…
        </p>
      )}

      {roster.isError && (
        <p role="alert" className="bcc-mono mt-3 text-[10px] tracking-[0.16em] text-safety">
          Couldn&apos;t load the member list. Refresh and try again.
        </p>
      )}

      {roster.isSuccess && candidates.length === 0 && (
        <p className="bcc-mono mt-3 text-[10px] tracking-[0.16em] text-ink-soft">
          No other members yet — the new owner must already be a member of
          this community.
        </p>
      )}

      {candidates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor={`transfer-receiver-${group.id}`}>
            New owner
          </label>
          <select
            id={`transfer-receiver-${group.id}`}
            value={selectedId ?? ""}
            onChange={(e) => {
              mutation.reset();
              const parsed = Number.parseInt(e.target.value, 10);
              setSelectedId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
            }}
            disabled={mutation.isPending}
            className="bcc-mono min-w-0 bg-paper px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
          >
            <option value="">Pick the new owner…</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name} (@{member.handle})
              </option>
            ))}
          </select>
          {roster.hasNextPage && (
            <button
              type="button"
              onClick={() => {
                if (!roster.isFetchingNextPage) {
                  void roster.fetchNextPage();
                }
              }}
              disabled={roster.isFetchingNextPage}
              className="bcc-mono border-2 border-cardstock-edge px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink-soft transition motion-reduce:transition-none hover:border-ink/50 hover:text-ink disabled:opacity-60"
            >
              {roster.isFetchingNextPage ? "LOADING…" : "MORE MEMBERS"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              mutation.reset();
              setConfirming(true);
            }}
            disabled={selected === null || mutation.isPending}
            className="bcc-mono border-2 border-cardstock-edge px-3 py-1.5 text-[11px] tracking-[0.18em] text-ink transition motion-reduce:transition-none hover:border-ink/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            TRANSFER…
          </button>
        </div>
      )}

      {errorMessage !== null && (
        <p role="alert" className="bcc-mono mt-3 text-[10px] tracking-[0.14em] text-safety">
          {errorMessage}
        </p>
      )}

      {confirming && selected !== null && (
        <Dialog
          title="Transfer ownership"
          onClose={() => {
            if (!mutation.isPending) setConfirming(false);
          }}
          panelClassName="max-w-md"
        >
          <p className="font-serif text-[15px] leading-relaxed text-bcc-text">
            Hand{" "}
            <strong>
              {group.name}
            </strong>{" "}
            to <strong>{selected.display_name}</strong> (@{selected.handle})?
          </p>
          <p className="mt-3 font-serif text-[14px] leading-relaxed text-bcc-text-secondary">
            They become the owner immediately, and you become an ordinary
            member. Both of you start a 30-day cooldown on creating,
            receiving, or transferring communities.
          </p>
          {errorMessage !== null && (
            <p role="alert" className="bcc-mono mt-3 text-[10px] tracking-[0.14em] text-safety">
              {errorMessage}
            </p>
          )}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={mutation.isPending}
              className="bcc-mono px-4 py-2 text-[11px] tracking-[0.16em] text-bcc-text-secondary transition motion-reduce:transition-none hover:text-bcc-text disabled:opacity-60"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => {
                mutation.mutate({ groupId: group.id, toUserId: selected.id });
              }}
              disabled={mutation.isPending}
              className="bcc-stencil bg-ink px-5 py-2.5 text-cardstock transition motion-reduce:transition-none disabled:opacity-60"
            >
              {mutation.isPending ? "Transferring…" : "Transfer ownership"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
