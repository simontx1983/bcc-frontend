"use client";

/**
 * NotificationsStep — V2 Phase 2 retention slice. Extracted from
 * OnboardingWizard.tsx (Phase 3.3 god-component split); markup and
 * behavior unchanged.
 *
 * The user has just pulled cards and chosen a home chain. This step
 * surfaces the bell / email digest / push opt-ins so they LEARN the
 * notification channels exist at signup, not by digging into
 * /settings/notifications later.
 *
 * Server-side defaults (`NotificationPrefs::DEFAULTS`) are already
 * sane — bell on for everything, email digest off, push master off.
 * So a Skip-clicker proceeds with safe defaults; explicit Continue
 * fires a single PATCH /me/notification-prefs with whatever the user
 * changed.
 *
 * The push master toggle is the exception: it must run inside the
 * user-gesture chain (browser permission prompt requires it), so it
 * fires immediately on click via `usePushSubscription.enable.mutate()`
 * — same pattern as the settings page. Per-event push toggles aren't
 * surfaced here (kept under "More options" via the settings link) —
 * the wizard isn't a kitchen-sink toggle list.
 *
 * Skip is always available. The settings page is linked on the way
 * out so users know where to come back.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from "@/hooks/useNotificationPrefs";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { humanizeCode } from "@/lib/api/errors";
import type { NotificationPrefsPatch } from "@/lib/api/types";

export function NotificationsStep({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const prefsQuery = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const push = usePushSubscription();

  // Local draft seeded from the server response. We commit on Continue
  // (single PATCH); Skip leaves the server state untouched.
  const [emailDigest, setEmailDigest] = useState<boolean | null>(null);
  const [bellEnabled, setBellEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed once when prefs land. The bell toggle here is a single rollup
  // — turning it OFF flips every bell event off in one click; turning
  // it ON flips them all on. Per-event control lives on the settings
  // page (under the More options link below).
  useEffect(() => {
    if (prefsQuery.data === undefined || emailDigest !== null) return;
    setEmailDigest(prefsQuery.data.email_digest);
    setBellEnabled(
      Object.values(prefsQuery.data.bell).some((on) => on === true),
    );
  }, [prefsQuery.data, emailDigest]);

  const pushBusy = push.enable.isPending || push.disable.isPending;
  const pushMasterError = push.enable.isError
    ? humanizePushMutationErrorBrief(push.enable.error)
    : push.disable.isError
      ? humanizePushMutationErrorBrief(push.disable.error)
      : null;

  const pushMasterOn = (() => {
    if (prefsQuery.data === undefined) return false;
    return prefsQuery.data.push.enabled;
  })();

  const handlePushToggle = () => {
    if (pushBusy || !push.isReady) return;
    if (pushMasterOn) {
      push.disable.mutate();
    } else {
      push.enable.mutate();
    }
  };

  const handleContinue = () => {
    if (prefsQuery.data === undefined || emailDigest === null || bellEnabled === null) {
      onDone();
      return;
    }
    const patch: NotificationPrefsPatch = {};
    if (emailDigest !== prefsQuery.data.email_digest) {
      patch.email_digest = emailDigest;
    }
    // Bell rollup: only PATCH the bell sub-tree if the user actively
    // changed the rollup state. The "all on" default is already on the
    // server; no need to PATCH if the user didn't touch it.
    const serverBellOn = Object.values(prefsQuery.data.bell).some(
      (on) => on === true,
    );
    if (bellEnabled !== serverBellOn) {
      const target: Partial<Record<keyof typeof prefsQuery.data.bell, boolean>> = {};
      for (const key of Object.keys(prefsQuery.data.bell) as Array<
        keyof typeof prefsQuery.data.bell
      >) {
        target[key] = bellEnabled;
      }
      patch.bell = target;
    }
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    setError(null);
    updatePrefs.mutate(patch, {
      onSuccess: () => onDone(),
      onError: (err) =>
        setError(
          humanizeCode(
            err,
            {
              bcc_unauthorized: "Sign in to save your preferences.",
              bcc_rate_limited: "Saving too fast — try again in a moment.",
              bcc_invalid_request:
                "Couldn't save these preferences. Check your selections.",
            },
            "Couldn't save preferences.",
          ),
        ),
    });
  };

  const saving = updatePrefs.isPending;

  return (
    <>
      <section className="mx-auto max-w-3xl px-6 pt-12 sm:px-8">
        <h1 className="bcc-stencil text-cardstock text-5xl md:text-6xl">
          Stay posted.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-xl text-cardstock-deep">
          Pick how we&apos;ll keep you in the loop. You can change all of these
          any time in{" "}
          <Link
            href="/u/me?tab=notifications"
            className="underline-offset-4 hover:underline"
          >
            your Notifications tab
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto mt-10 flex max-w-3xl flex-col gap-4 px-6 sm:px-8">
        {/* Bell rollup */}
        <WizardOptCard
          title="In-app bell"
          subtitle="Reactions, reviews, endorsements, new watchers on your cards, rank-ups."
          checked={bellEnabled === true}
          disabled={prefsQuery.isLoading || saving}
          onChange={setBellEnabled}
        />

        {/* Email digest */}
        <WizardOptCard
          title="Weekly email digest"
          subtitle="A plain-text summary of unread bell notifications, sent Sunday. One-click unsubscribe in every email."
          checked={emailDigest === true}
          disabled={prefsQuery.isLoading || saving}
          onChange={setEmailDigest}
        />

        {/* Push (separate gesture-bound flow) */}
        <div className="bcc-panel flex flex-col gap-3 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="bcc-stencil text-lg text-bcc-text">Browser push</h3>
              <p className="bcc-mono mt-1 text-[11px] text-bcc-text-secondary">
                Real-time pings for high-stakes events only — reviews,
                endorsements, dispute outcomes, panelist invites. Off by default.
              </p>
            </div>
            {push.isSupported ? (
              <button
                type="button"
                onClick={handlePushToggle}
                disabled={pushBusy || !push.isReady || saving}
                className={
                  "bcc-stencil shrink-0 rounded-sm px-3 py-2 text-[10px] tracking-[0.2em] transition motion-reduce:transition-none " +
                  (pushMasterOn
                    ? "bg-cardstock-deep/40 text-ink"
                    : "bg-safety text-ink hover:bg-safety/90 disabled:cursor-wait disabled:opacity-60")
                }
              >
                {pushBusy
                  ? pushMasterOn
                    ? "DISABLING…"
                    : "ENABLING…"
                  : pushMasterOn
                    ? "ENABLED"
                    : "ENABLE"}
              </button>
            ) : (
              <span className="bcc-mono shrink-0 text-[10px] text-bcc-text-secondary/70">
                NOT SUPPORTED
              </span>
            )}
          </div>
          {pushMasterError !== null && (
            <p role="alert" className="bcc-mono text-[11px] text-safety">
              {pushMasterError}
            </p>
          )}
        </div>
      </section>

      <footer className="mx-auto mt-12 flex max-w-3xl items-center justify-between gap-4 px-6 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="bcc-mono text-cardstock-deep underline-offset-4 hover:underline disabled:opacity-50"
        >
          ← Back
        </button>

        <div className="flex items-center gap-4">
          {error !== null && (
            <span role="alert" className="bcc-mono text-[11px] text-safety">
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={onDone}
            disabled={saving}
            className="bcc-mono text-cardstock-deep underline-offset-4 hover:underline disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="bcc-stencil flex items-center gap-3 bg-safety px-6 py-3 text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </div>
      </footer>
    </>
  );
}

// Compact opt-in card used by NotificationsStep. A larger sibling of
// the toggle row in NotificationPrefsForm — bigger touch target,
// more breathing room for the wizard register.
function WizardOptCard({
  title,
  subtitle,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={
        "bcc-panel flex cursor-pointer items-start justify-between gap-4 px-5 py-4 transition motion-reduce:transition-none " +
        (disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-cardstock-edge")
      }
    >
      <div className="flex flex-col gap-1">
        <h3 className="bcc-stencil text-lg text-bcc-text">{title}</h3>
        <p className="bcc-mono text-[11px] text-bcc-text-secondary">{subtitle}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
      />
    </label>
  );
}

// Inline humanizer mirroring the one in NotificationPrefsForm but
// dependency-free (no module import — keeps the wizard self-contained).
function humanizePushMutationErrorBrief(err: { message?: string; code?: string } | Error): string {
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message ?? "";
  if (code === "bcc_push_not_configured") {
    return "Push isn't configured on this site yet.";
  }
  if (message.includes("permission") || message.includes("denied")) {
    return "Permission was blocked in your browser. Re-allow it in site settings to enable push.";
  }
  return message !== "" ? message : "Couldn't update push notifications.";
}
