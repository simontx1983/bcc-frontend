"use client";

/**
 * PrivacySettingsForm — eight §K2 + discovery toggles, no submit step.
 *
 * Each row is a label + helper + switch. The switch flips optimistically
 * via `useUpdateMyPrivacy`; the row shows a tiny "saving" affordance
 * during the round-trip and a "saved" / "couldn't save" reply for ~2s.
 *
 * Why no batch submit: privacy toggles are per-thought, not a batch
 * configuration — a user pulls one lever, sees the effect, moves on.
 * A "save changes" button would let stale state sit in the form and
 * ship a partial bag the user forgot they touched.
 */

import { useEffect, useState } from "react";

import { useMyPrivacy, useUpdateMyPrivacy } from "@/hooks/useMyPrivacy";
import type { MyPrivacySettings } from "@/lib/api/types";

type ToggleKey = keyof MyPrivacySettings;

interface ToggleSpec {
  key: ToggleKey;
  label: string;
  helper: string;
}

interface ToggleSection {
  title: string;
  blurb: string;
  toggles: ToggleSpec[];
}

const SECTIONS: ToggleSection[] = [
  {
    title: "Visibility on the Floor",
    blurb: "Hide tabs and counts from non-self viewers.",
    toggles: [
      {
        key: "binder_hidden",
        label: "Hide my binder",
        helper: "Others see a private placeholder; the count drops to 0.",
      },
      {
        key: "reviews_hidden",
        label: "Hide my reviews",
        helper: "Reviews tab shows as private to others.",
      },
      {
        key: "disputes_hidden",
        label: "Hide my disputes",
        helper: "Disputes tab shows as private to others.",
      },
      {
        key: "delegations_hidden",
        label: "Hide my delegations",
        helper: "Network panel collapses for non-self viewers.",
      },
      {
        key: "follower_count_hidden",
        label: "Hide my follower count",
        helper: "“Pulled by” drops to 0 on others' renders of your card.",
      },
    ],
  },
  {
    title: "Personal info",
    blurb: "Reduce what's exposed alongside your handle.",
    toggles: [
      {
        key: "real_name_hidden",
        label: "Hide my real name",
        helper: "Others see @handle in place of your display name.",
      },
      {
        key: "email_hidden",
        label: "Hide my email",
        helper: "Email never surfaces in the user view-model.",
      },
    ],
  },
  {
    title: "Discovery",
    blurb: "Whether you appear in search results.",
    toggles: [
      {
        key: "discovery_optout",
        label: "Don't list me in user search",
        helper:
          "Removed from PeepSo's user search index. Direct profile links still work.",
      },
    ],
  },
];

export function PrivacySettingsForm() {
  const { data, isPending, isError, error } = useMyPrivacy();
  const mutation = useUpdateMyPrivacy();

  // Pending-key + last-result tracking so the row can show a tiny
  // status pip without hijacking React Query's global state.
  const [recent, setRecent] = useState<{
    key: ToggleKey;
    state: "saving" | "saved" | "error";
  } | null>(null);

  useEffect(() => {
    if (recent === null || recent.state === "saving") return;
    const handle = window.setTimeout(() => setRecent(null), 2_200);
    return () => window.clearTimeout(handle);
  }, [recent]);

  function flip(key: ToggleKey, next: boolean) {
    setRecent({ key, state: "saving" });
    mutation.mutate(
      { [key]: next },
      {
        onSuccess: () => setRecent({ key, state: "saved" }),
        onError: () => setRecent({ key, state: "error" }),
      },
    );
  }

  if (isPending) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-ink-soft">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bcc-panel p-6">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load privacy settings: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map((section) => (
        <section key={section.title} className="bcc-panel p-6">
          <header className="mb-4 border-b border-cardstock-edge pb-3">
            <h2 className="bcc-stencil text-xl text-cardstock">
              {section.title}
            </h2>
            <p className="bcc-mono mt-1 text-[11px] tracking-[0.14em] text-ink-soft">
              {section.blurb}
            </p>
          </header>

          <ul className="flex flex-col divide-y divide-cardstock-edge/60">
            {section.toggles.map((toggle) => {
              const value = data[toggle.key];
              const status =
                recent !== null && recent.key === toggle.key ? recent.state : null;
              return (
                <li
                  key={toggle.key}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-serif text-ink">{toggle.label}</span>
                    <span className="bcc-mono text-[11px] text-ink-soft">
                      {toggle.helper}
                    </span>
                    {status === "saving" && (
                      <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft/70">
                        SAVING…
                      </span>
                    )}
                    {status === "saved" && (
                      <span
                        className="bcc-mono text-[10px] tracking-[0.18em]"
                        style={{ color: "var(--verified)" }}
                      >
                        SAVED
                      </span>
                    )}
                    {status === "error" && (
                      <span className="bcc-mono text-[10px] tracking-[0.18em] text-safety">
                        COULDN&apos;T SAVE
                      </span>
                    )}
                  </div>

                  <ToggleSwitch
                    label={toggle.label}
                    value={value}
                    pending={mutation.isPending && recent?.key === toggle.key}
                    onChange={(next) => flip(toggle.key, next)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ToggleSwitch — accessible button-as-switch. Uses role="switch" +
// aria-checked so screen readers announce both the state and the action.
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
