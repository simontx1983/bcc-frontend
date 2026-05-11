"use client";

/**
 * §I1 + V2 Phase 1 NotificationPrefsForm — toggle UI for /settings/notifications.
 *
 * Four sections:
 *
 *   1. Email digest opt-in (single toggle)
 *   2. Bell event toggles (one row per BellEventType)
 *   3. Web push (master toggle + per-event toggles, V2 Phase 1)
 *   4. Save / saving state + last-saved confirmation
 *
 * Each toggle except the push master is local state until the user
 * clicks Save — we don't fire a PATCH per click because the PATCH
 * route is partial-update and could otherwise produce a half-saved
 * state on flaky networks.
 *
 * The push master toggle is the exception: it must run under the
 * user-gesture chain (browser permission prompt requires it), so it
 * fires immediately. Per-event push toggles ride the standard draft
 * + Save flow with everything else.
 *
 * Disabled state: the form blocks during the save mutation. Errors
 * surface in a single inline error row; success surfaces a quiet
 * "Saved" confirmation that fades after 3s.
 */

import { useEffect, useMemo, useState } from "react";

import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from "@/hooks/useNotificationPrefs";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import type {
  BccApiError,
  BellEventType,
  NotificationPrefs,
  NotificationPrefsPatch,
  PushEventType,
} from "@/lib/api/types";

interface BellRow {
  key: BellEventType;
  label: string;
  blurb: string;
}

interface PushRow {
  key: PushEventType;
  label: string;
  blurb: string;
}

const BELL_ROWS: ReadonlyArray<BellRow> = [
  {
    key: "bcc_reaction",
    label: "Reactions on your posts",
    blurb: "@somebody agreed with / vouched for / stood behind your post.",
  },
  {
    key: "bcc_review",
    label: "Reviews on your pages",
    blurb: "Someone reviewed a validator / project / creator page you own.",
  },
  {
    key: "bcc_endorse",
    label: "Endorsements on your pages",
    blurb: "Someone endorsed a validator / project / creator page you own.",
  },
  {
    key: "bcc_card_pulled",
    label: "Watchers on your card",
    blurb: "Someone is now keeping tabs on your card.",
  },
  {
    key: "bcc_rank_up",
    label: "Rank progression",
    blurb: "You climbed to a new rank — a quieter audit-trail companion to the celebration toast.",
  },
  {
    key: "bcc_welcome",
    label: "Welcome notification",
    blurb: "A one-time first-touch notification when you signed up — proves the bell channel works. You'll only ever see one.",
  },
  {
    key: "bcc_mention",
    label: "Mentions in posts and comments",
    blurb: "Someone @-tagged you in a post or comment. Fires once per author per post; edits don't ping again.",
  },
];

// V2 Phase 1: push event taxonomy is a deliberate subset of the bell.
// Bell shows everything; push is "you really need to know this" only.
const PUSH_ROWS: ReadonlyArray<PushRow> = [
  {
    key: "review",
    label: "Reviews on your pages",
    blurb: "Someone reviewed a validator / project / creator page you own.",
  },
  {
    key: "endorse",
    label: "Endorsements on your pages",
    blurb: "Someone endorsed a validator / project / creator page you own.",
  },
  {
    key: "dispute_outcome",
    label: "Dispute outcomes",
    blurb: "A dispute you reported reached a final adjudication.",
  },
  {
    key: "panelist_selected",
    label: "Panelist selection",
    blurb: "You've been invited to vote on a new dispute panel.",
  },
  {
    key: "mention",
    label: "Mentions in posts and comments",
    blurb: "Push to your device when someone @-tags you. Rapid-fire mentions coalesce into one push.",
  },
];

export function NotificationPrefsForm() {
  const query = useNotificationPrefs();
  const push = usePushSubscription();
  const mutation = useUpdateNotificationPrefs({
    onSuccess: () => {
      setSavedAt(Date.now());
      setError(null);
    },
    onError: (err) => setError(humanizeError(err)),
  });

  const [draft, setDraft] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Seed the local draft once the server prefs land. Re-syncs on
  // explicit cache primes (e.g. another tab updates).
  useEffect(() => {
    if (query.data === undefined) return;
    setDraft(query.data);
  }, [query.data]);

  // Saved confirmation auto-fades.
  useEffect(() => {
    if (savedAt === null) return;
    const t = window.setTimeout(() => setSavedAt(null), 3_000);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const dirty = useMemo(() => {
    if (draft === null || query.data === undefined) return false;
    return diffPatch(query.data, draft) !== null;
  }, [draft, query.data]);

  const handleSave = () => {
    if (draft === null || query.data === undefined) return;
    const patch = diffPatch(query.data, draft);
    if (patch === null) return;
    setError(null);
    mutation.mutate(patch);
  };

  if (query.isLoading || draft === null) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-[11px] text-ink-soft/70">
          Loading your preferences…
        </p>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="bcc-panel p-6">
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          Couldn&apos;t load your notification preferences. Refresh and try again.
        </p>
      </div>
    );
  }

  const disabled = mutation.isPending;
  const pushBusy = push.enable.isPending || push.disable.isPending;
  const pushMasterError = push.enable.isError
    ? humanizePushMutationError(push.enable.error)
    : push.disable.isError
      ? humanizePushMutationError(push.disable.error)
      : null;
  const handlePushMasterToggle = (value: boolean) => {
    if (pushBusy) return;
    if (value) {
      push.enable.mutate();
    } else {
      push.disable.mutate();
    }
  };

  return (
    <div className="bcc-panel flex flex-col gap-6 p-6">
      <section className="flex flex-col gap-2">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          NOTIFICATIONS · EMAIL DIGEST
        </span>
        <h2 className="bcc-stencil text-2xl text-ink">Weekly email digest</h2>
        <p className="font-serif text-sm text-ink-soft">
          A plain-text summary of unread bell notifications from the past week.
          Off by default — turn it on to keep up without checking back in. You
          can unsubscribe with one click from any digest email.
        </p>
        <ToggleRow
          label="Email me a weekly digest"
          checked={draft.email_digest}
          disabled={disabled}
          onChange={(value) => setDraft({ ...draft, email_digest: value })}
        />
      </section>

      <hr className="border-cardstock-edge/30" />

      <section className="flex flex-col gap-2">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          NOTIFICATIONS · BELL
        </span>
        <h2 className="bcc-stencil text-2xl text-ink">In-app bell</h2>
        <p className="font-serif text-sm text-ink-soft">
          Per-event toggles for the bell dropdown. Turning one off stops new
          rows of that type from arriving — existing rows stay visible until
          you mark them read.
        </p>
        <div className="mt-2 flex flex-col gap-3">
          {BELL_ROWS.map((row) => (
            <ToggleRow
              key={row.key}
              label={row.label}
              blurb={row.blurb}
              checked={draft.bell[row.key]}
              disabled={disabled}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  bell: { ...draft.bell, [row.key]: value },
                })
              }
            />
          ))}
        </div>
      </section>

      <hr className="border-cardstock-edge/30" />

      <section className="flex flex-col gap-2">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          NOTIFICATIONS · PUSH
        </span>
        <h2 className="bcc-stencil text-2xl text-ink">Browser push</h2>
        <p className="font-serif text-sm text-ink-soft">
          Real-time pings to this device for high-stakes events only — bell
          + email digest still cover the rest. Off by default; turning it on
          asks the browser for notification permission. You can disable it
          per device or at the account level any time.
        </p>

        {!push.isSupported ? (
          <p className="bcc-mono mt-2 text-[11px] text-ink-soft/70">
            Your browser doesn&apos;t support push notifications. The bell
            and weekly email digest above still work.
          </p>
        ) : (
          <>
            <ToggleRow
              label={
                pushBusy
                  ? draft.push.enabled
                    ? "Disabling…"
                    : "Subscribing…"
                  : "Enable push notifications on this device"
              }
              checked={draft.push.enabled}
              disabled={disabled || pushBusy || !push.isReady}
              onChange={handlePushMasterToggle}
            />
            {pushMasterError !== null && (
              <p
                role="alert"
                className="bcc-mono mt-1 text-[11px] text-safety"
              >
                {pushMasterError}
              </p>
            )}

            {draft.push.enabled && (
              <div className="mt-2 flex flex-col gap-3">
                {PUSH_ROWS.map((row) => (
                  <ToggleRow
                    key={row.key}
                    label={row.label}
                    blurb={row.blurb}
                    checked={draft.push.events[row.key]}
                    disabled={disabled}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        push: {
                          ...draft.push,
                          events: { ...draft.push.events, [row.key]: value },
                        },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bcc-mono text-[11px] text-ink-soft/70">
          {savedAt !== null && (
            <span style={{ color: "var(--verified)" }}>Saved.</span>
          )}
          {error !== null && (
            <span role="alert" className="text-safety">
              {error}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || disabled}
          aria-disabled={!dirty || disabled}
          className={
            "bcc-stencil rounded-sm px-5 py-2.5 text-[12px] tracking-[0.2em] transition motion-reduce:transition-none " +
            (dirty && !disabled
              ? "bg-ink text-cardstock hover:bg-blueprint"
              : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
          }
        >
          {disabled ? "Saving…" : "SAVE PREFERENCES"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ToggleRow — labeled checkbox-as-switch row. Shared by email digest
// + each bell event.
// ─────────────────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  blurb?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({
  label,
  blurb,
  checked,
  disabled,
  onChange,
}: ToggleRowProps) {
  return (
    <label
      className={
        "flex cursor-pointer items-start justify-between gap-3 border border-cardstock-edge bg-cardstock-deep/40 px-4 py-3 transition motion-reduce:transition-none " +
        (disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-ink/40")
      }
    >
      <span className="flex flex-col gap-0.5">
        <span className="font-serif text-[14px] text-ink">{label}</span>
        {blurb !== undefined && (
          <span className="bcc-mono text-[10px] tracking-[0.04em] text-ink-soft">
            {blurb}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
      />
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// diffPatch — produce a partial-update payload from current vs draft.
// Returns null when nothing changed (lets the form skip the PATCH).
// ─────────────────────────────────────────────────────────────────────

function diffPatch(
  current: NotificationPrefs,
  draft: NotificationPrefs,
): NotificationPrefsPatch | null {
  const patch: NotificationPrefsPatch = {};
  if (current.email_digest !== draft.email_digest) {
    patch.email_digest = draft.email_digest;
  }
  const bellPatch: Partial<Record<BellEventType, boolean>> = {};
  let bellChanged = false;
  for (const key of Object.keys(draft.bell) as BellEventType[]) {
    if (current.bell[key] !== draft.bell[key]) {
      bellPatch[key] = draft.bell[key];
      bellChanged = true;
    }
  }
  if (bellChanged) {
    patch.bell = bellPatch;
  }

  // Push events only — the master toggle (push.enabled) is driven
  // exclusively by usePushSubscription's enable/disable mutations,
  // never by the Save button. Including it here would let the form
  // stomp on the server state set by enable() before the cache
  // re-syncs to the form's draft.
  const pushEventsPatch: Partial<Record<PushEventType, boolean>> = {};
  let pushEventsChanged = false;
  for (const key of Object.keys(draft.push.events) as PushEventType[]) {
    if (current.push.events[key] !== draft.push.events[key]) {
      pushEventsPatch[key] = draft.push.events[key];
      pushEventsChanged = true;
    }
  }
  if (pushEventsChanged) {
    patch.push = { events: pushEventsPatch };
  }

  if (
    patch.email_digest === undefined &&
    patch.bell === undefined &&
    patch.push === undefined
  ) {
    return null;
  }
  return patch;
}

// ─────────────────────────────────────────────────────────────────────
// Error humanizer
// ─────────────────────────────────────────────────────────────────────

function humanizeError(err: BccApiError): string {
  switch (err.code) {
    case "bcc_unauthorized":
      return "Sign in required.";
    case "bcc_invalid_request":
      return err.message || "Couldn't save these preferences.";
    default:
      return err.message !== ""
        ? err.message
        : "Couldn't save these preferences. Try again.";
  }
}

// Push enable/disable mutations can reject with either a server-side
// BccApiError (e.g. bcc_push_not_configured 503) or a client-side
// Error (permission denied, browser unsupported, etc). Duck-type on
// the `code` property to fork into the right humanizer.
function humanizePushMutationError(err: BccApiError | Error): string {
  if (typeof (err as BccApiError).code === "string") {
    const apiErr = err as BccApiError;
    if (apiErr.code === "bcc_push_not_configured") {
      return "Push isn't configured on this site yet. Ask an administrator to generate VAPID keys.";
    }
    return humanizeError(apiErr);
  }
  if (err.message.includes("permission") || err.message.includes("denied")) {
    return "Notification permission was blocked in your browser. Re-allow it in your site settings to enable push.";
  }
  return err.message !== ""
    ? err.message
    : "Couldn't update push notifications. Try again.";
}
