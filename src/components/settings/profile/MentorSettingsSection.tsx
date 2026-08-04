"use client";

/**
 * MentorSettingsSection — Rank Phase 7 (§21.4, v1.62) mentor-listing
 * control on the owner-only Privacy tab (/u/[handle]?tab=privacy).
 *
 * One toggle bound to `mentor_opt_in` (saves on tap, like the per-field
 * privacy switches) plus a live status line composed from the two
 * READ-ONLY fields (`mentor_listed` / `mentor_eligibility_reason`).
 * Listing = opt-in AND live eligibility (Veteran, tier ≥ Trusted, not
 * suspended, not in recovery) — the eligibility half is never
 * materialized server-side, so this surface never computes it either:
 * it renders exactly what the prefs read returns.
 *
 * Old-backend tolerance: pre-Phase-7 backends omit all three fields —
 * when `mentor_opt_in` is undefined the section renders NOTHING (the
 * toggle would silently no-op there, which is worse than absence).
 */

import { useProfilePrefs, useUpdateProfilePrefs } from "@/hooks/useProfilePrefs";
import type { ProfilePrefs } from "@/lib/api/profile-prefs-endpoints";
import { BccApiError, type MentorEligibilityReason } from "@/lib/api/types";

/**
 * §γ — paused-listing copy keyed on the stable machine reason. Plain
 * state descriptions; no cadence pressure. Unknown reasons (future
 * backend) degrade to the generic paused line.
 */
const ELIGIBILITY_PAUSE_COPY: Record<MentorEligibilityReason, string> = {
  suspended: "Listing is paused while your account is suspended.",
  new_member: "Listing is paused until your rank reaches Veteran.",
  below_veteran: "Listing is paused until your rank reaches Veteran.",
  below_trusted: "Listing is paused while your Trust is below Trusted.",
  in_recovery: "Listing is paused while your rank is in recovery.",
};

function pauseCopy(reason: string | null | undefined): string {
  if (typeof reason === "string" && reason in ELIGIBILITY_PAUSE_COPY) {
    return ELIGIBILITY_PAUSE_COPY[reason as MentorEligibilityReason];
  }
  return "Listing is paused right now.";
}

export function MentorSettingsSection() {
  const query = useProfilePrefs();

  if (query.isLoading) {
    return (
      <p className="bcc-mono py-4 text-[11px] text-bcc-text-secondary">
        Loading mentor settings…
      </p>
    );
  }
  if (query.isError || query.data === undefined) {
    return (
      <p role="alert" className="bcc-mono py-4 text-[11px] text-safety">
        Could not load mentor settings.
      </p>
    );
  }
  // Pre-Phase-7 backend — the field doesn't exist, so neither does the
  // control. Explicit emptiness beats a toggle that silently no-ops.
  if (query.data.mentor_opt_in === undefined) {
    return null;
  }

  return <MentorToggle prefs={query.data} />;
}

function MentorToggle({ prefs }: { prefs: ProfilePrefs }) {
  const mutation = useUpdateProfilePrefs();

  const optedIn = prefs.mentor_opt_in === true;
  const listed = prefs.mentor_listed === true;
  const reason = prefs.mentor_eligibility_reason ?? null;

  // Live status line — server-composed facts only.
  //   listed                    → you're in the directory
  //   opted in, not listed      → paused, with the reason
  //   not opted in, eligible    → what the toggle would do
  //   not opted in, ineligible  → pre-opt-in is allowed; explain the
  //                               auto-listing behavior
  const statusLine = listed
    ? "You're listed in the Mentors directory."
    : optedIn
      ? pauseCopy(reason)
      : reason === null
        ? "You meet the requirements — turn this on to appear in the Mentors directory."
        : "You can opt in now. You'll be listed automatically once you reach Veteran rank with Trusted standing.";

  const errorMessage = mutation.error
    ? mutation.error instanceof BccApiError &&
      mutation.error.code === "bcc_unauthorized"
      ? "Sign in again to change this."
      : "Couldn't save the mentor setting. Try again."
    : null;

  return (
    <section className="bcc-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="bcc-mono text-[11px] tracking-[0.18em] text-bcc-text">
            MENTOR LISTING
          </h3>
          <p className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary">
            List yourself in the Mentors directory so newer operators can
            find you. Listing requires Veteran rank and Trusted standing —
            it pauses automatically whenever you don&apos;t qualify.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optedIn}
          aria-label="List me as a mentor"
          disabled={mutation.isPending}
          onClick={() => {
            mutation.reset();
            mutation.mutate({ mentor_opt_in: !optedIn });
          }}
          className="bcc-mono inline-flex shrink-0 items-center border-2 border-bcc-border-strong px-3 py-1.5 text-[11px] tracking-[0.18em] text-bcc-text-secondary transition motion-reduce:transition-none hover:text-bcc-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? "SAVING…" : optedIn ? "OPTED IN" : "OPTED OUT"}
        </button>
      </div>
      <p
        role="status"
        className="bcc-mono mt-3 text-[10px] tracking-[0.12em]"
        style={listed ? { color: "var(--verified)" } : undefined}
      >
        {listed ? statusLine : (
          <span className="text-bcc-text-secondary">{statusLine}</span>
        )}
      </p>
      {errorMessage !== null && (
        <p role="alert" className="bcc-mono mt-2 text-[10px] tracking-[0.12em] text-safety">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
