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
    <section className="bcc-onb-step">
      <p className="bcc-onb-eyebrow">Stay posted</p>
      <h1 className="bcc-onb-disp">Stay in the loop.</h1>
      {/* No settings link here on purpose — onboarding funnels toward the
          Floor; a deep link out to settings pulls a brand-new user away
          from that path. The reassurance stays as plain text. */}
      <p className="bcc-onb-lede">
        Pick how we&rsquo;ll keep you posted. You can change all of these any time
        in your settings.
      </p>

      <div style={{ marginTop: "clamp(24px, 4vw, 40px)", display: "flex", flexDirection: "column", gap: "14px" }}>
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
        <div className="bcc-onb-opt" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <h3>Browser push</h3>
              <p>
                Real-time pings for high-stakes events only — reviews, endorsements,
                dispute outcomes, panelist invites. Off by default.
              </p>
            </div>
            {push.isSupported ? (
              <button
                type="button"
                onClick={handlePushToggle}
                disabled={pushBusy || !push.isReady || saving}
                className={"bcc-onb-opt-toggle " + (pushMasterOn ? "is-on" : "is-off")}
              >
                {pushBusy
                  ? pushMasterOn ? "Disabling…" : "Enabling…"
                  : pushMasterOn ? "Enabled" : "Enable"}
              </button>
            ) : (
              <span className="bcc-onb-note">Not supported</span>
            )}
          </div>
          {pushMasterError !== null && (
            <p role="alert" className="bcc-onb-err" style={{ marginTop: "10px" }}>
              {pushMasterError}
            </p>
          )}
        </div>
      </div>

      <footer className="bcc-onb-foot">
        <button type="button" className="bcc-onb-link" onClick={onBack} disabled={saving}>
          ← Back
        </button>
        <div className="bcc-onb-foot-end">
          {error !== null && (
            <span role="alert" className="bcc-onb-err">{error}</span>
          )}
          <button type="button" className="bcc-onb-link" onClick={onDone} disabled={saving}>
            Skip
          </button>
          <button type="button" className="bcc-onb-btn bcc-onb-btn-primary" onClick={handleContinue} disabled={saving}>
            {saving ? "Saving…" : "Continue"}
          </button>
        </div>
      </footer>
    </section>
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
    <label className="bcc-onb-opt" style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined}>
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
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
