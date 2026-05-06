"use client";

/**
 * ProfilePrefsSection — the Preferences sub-tab on /settings/profile.
 *
 * Three controls:
 *   - profile_visibility  — who can see your profile at all
 *   - post_visibility     — default audience for posts on your wall
 *   - hide_birthday_year  — toggle to hide year-of-birth
 *
 * Local draft + single Save button. Mirrors the messages-prefs pattern
 * — no per-control auto-save; the Save button mutates whatever's dirty.
 */

import { useEffect, useMemo, useState } from "react";

import {
  useProfilePrefs,
  useUpdateProfilePrefs,
} from "@/hooks/useProfilePrefs";
import type {
  ProfilePrefs,
  ProfileVisibility,
  PostVisibility,
} from "@/lib/api/profile-prefs-endpoints";
import { BccApiError } from "@/lib/api/types";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:    "We couldn't accept that. Check the values and try again.",
  bcc_unauthorized:       "Sign in required.",
  bcc_peepso_unavailable: "Profile preferences aren't available right now.",
  bcc_internal_error:     "Server error. Try again.",
};

function humanizeError(err: BccApiError | Error): string {
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? err.message;
  }
  return "Something went wrong. Try again.";
}

const PROFILE_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: ProfileVisibility;
  label: string;
  blurb: string;
}> = [
  {
    value: "public",
    label: "Public",
    blurb: "Anyone — including signed-out visitors and search engines.",
  },
  {
    value: "members",
    label: "Members only",
    blurb: "Only signed-in community members can see your profile.",
  },
  {
    value: "private",
    label: "Private",
    blurb: "Only you. Your profile is hidden from everyone else.",
  },
];

const POST_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: PostVisibility;
  label: string;
  blurb: string;
}> = [
  {
    value: "members",
    label: "Members",
    blurb: "Any signed-in member can post on your wall.",
  },
  {
    value: "private",
    label: "Only me",
    blurb: "Lock your wall so only you can post on it.",
  },
];

/**
 * Audience options for the user's OWN wall posts (default-audience picker).
 * Different copy from PROFILE_VISIBILITY_OPTIONS because here we're
 * scoping audience for a specific post, not "who can see my profile".
 */
const DEFAULT_POST_AUDIENCE_OPTIONS: ReadonlyArray<{
  value: ProfileVisibility;
  label: string;
  blurb: string;
}> = [
  {
    value: "public",
    label: "Public",
    blurb: "Anyone can see your post — including signed-out visitors.",
  },
  {
    value: "members",
    label: "Members only",
    blurb: "Only signed-in community members see your post.",
  },
  {
    value: "private",
    label: "Only me",
    blurb: "Drafts and private notes — nobody else sees them.",
  },
];

export function ProfilePrefsSection() {
  const query = useProfilePrefs();

  if (query.isLoading) {
    return (
      <p className="bcc-mono py-4 text-[11px] text-ink-soft">Loading preferences…</p>
    );
  }
  if (query.isError || query.data === undefined) {
    return (
      <p role="alert" className="bcc-mono py-4 text-[11px] text-safety">
        {query.error !== null && query.error !== undefined
          ? humanizeError(query.error)
          : "Could not load preferences."}
      </p>
    );
  }

  return <ProfilePrefsForm initial={query.data} />;
}

function ProfilePrefsForm({ initial }: { initial: ProfilePrefs }) {
  const [draft, setDraft] = useState<ProfilePrefs>(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Re-sync when the cache replaces `initial` (e.g. cross-tab updates).
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const mutation = useUpdateProfilePrefs({
    onSuccess: (data) => {
      setDraft(data);
      setSavedAt(Date.now());
      setServerError(null);
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const dirty = useMemo(() => {
    return (
      draft.profile_visibility !== initial.profile_visibility ||
      draft.post_visibility !== initial.post_visibility ||
      draft.hide_birthday_year !== initial.hide_birthday_year ||
      draft.hide_online !== initial.hide_online ||
      draft.hide_from_search !== initial.hide_from_search ||
      draft.default_post_audience !== initial.default_post_audience
    );
  }, [draft, initial]);

  function handleSave() {
    if (!dirty) return;
    setServerError(null);
    setSavedAt(null);
    const patch: Partial<ProfilePrefs> = {};
    if (draft.profile_visibility !== initial.profile_visibility) {
      patch.profile_visibility = draft.profile_visibility;
    }
    if (draft.post_visibility !== initial.post_visibility) {
      patch.post_visibility = draft.post_visibility;
    }
    if (draft.hide_birthday_year !== initial.hide_birthday_year) {
      patch.hide_birthday_year = draft.hide_birthday_year;
    }
    if (draft.hide_online !== initial.hide_online) {
      patch.hide_online = draft.hide_online;
    }
    if (draft.hide_from_search !== initial.hide_from_search) {
      patch.hide_from_search = draft.hide_from_search;
    }
    if (draft.default_post_audience !== initial.default_post_audience) {
      patch.default_post_audience = draft.default_post_audience;
    }
    mutation.mutate(patch);
  }

  const busy = mutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <section className="bcc-panel p-5">
        <h3 className="bcc-mono text-[11px] tracking-[0.18em] text-ink">
          WHO CAN SEE MY PROFILE
        </h3>
        <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
          Using anything other than Public may reduce the visibility and reach of your posts.
        </p>
        <RadioGroup
          name="profile_visibility"
          options={PROFILE_VISIBILITY_OPTIONS}
          value={draft.profile_visibility}
          onChange={(v) => setDraft({ ...draft, profile_visibility: v })}
          disabled={busy}
        />
      </section>

      <section className="bcc-panel p-5">
        <h3 className="bcc-mono text-[11px] tracking-[0.18em] text-ink">
          WHO CAN POST ON MY PROFILE
        </h3>
        <RadioGroup
          name="post_visibility"
          options={POST_VISIBILITY_OPTIONS}
          value={draft.post_visibility}
          onChange={(v) => setDraft({ ...draft, post_visibility: v })}
          disabled={busy}
        />
      </section>

      <section className="bcc-panel p-5">
        <h3 className="bcc-mono text-[11px] tracking-[0.18em] text-ink">DEFAULT AUDIENCE FOR MY POSTS</h3>
        <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
          The audience picker on new wall posts starts on this. Posting with a different audience
          updates the default to match — this is a sticky preference, not a hard lock.
        </p>
        <RadioGroup
          name="default_post_audience"
          options={DEFAULT_POST_AUDIENCE_OPTIONS}
          value={draft.default_post_audience}
          onChange={(v) => setDraft({ ...draft, default_post_audience: v })}
          disabled={busy}
        />
      </section>

      <section className="bcc-panel p-5">
        <h3 className="bcc-mono text-[11px] tracking-[0.18em] text-ink">DISCOVERY</h3>
        <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
          Stay readable but lower-profile. These don&apos;t affect who can see your content — just
          where you appear.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.hide_online}
              onChange={(e) =>
                setDraft({ ...draft, hide_online: e.target.checked })
              }
              disabled={busy}
              className="mt-1 accent-ink"
            />
            <span>
              <span className="bcc-mono block text-[11px] tracking-[0.14em] text-ink">
                Hide my online status
              </span>
              <span className="bcc-mono mt-1 block text-[10px] text-ink-soft">
                Suppress the green dot on your profile and member widgets.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.hide_from_search}
              onChange={(e) =>
                setDraft({ ...draft, hide_from_search: e.target.checked })
              }
              disabled={busy}
              className="mt-1 accent-ink"
            />
            <span>
              <span className="bcc-mono block text-[11px] tracking-[0.14em] text-ink">
                Don&apos;t list me in member search
              </span>
              <span className="bcc-mono mt-1 block text-[10px] text-ink-soft">
                Removed from the directory and search results. Direct profile links still work.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="bcc-panel p-5">
        <h3 className="bcc-mono text-[11px] tracking-[0.18em] text-ink">BIRTHDAY</h3>
        <label className="mt-2 flex items-start gap-3">
          <input
            type="checkbox"
            checked={draft.hide_birthday_year}
            onChange={(e) =>
              setDraft({ ...draft, hide_birthday_year: e.target.checked })
            }
            disabled={busy}
            className="mt-1 accent-ink"
          />
          <span>
            <span className="bcc-mono block text-[11px] tracking-[0.14em] text-ink">
              Hide my birthday year
            </span>
            <span className="bcc-mono mt-1 block text-[10px] text-ink-soft">
              Show only the day and month on your profile.
            </span>
          </span>
        </label>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div className="bcc-mono min-h-[1rem] text-[11px]">
          {serverError !== null && (
            <span role="alert" className="text-safety">{serverError}</span>
          )}
          {savedAt !== null && serverError === null && (
            <span role="status" style={{ color: "var(--verified)" }}>
              Preferences saved.
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={handleSave}
          className="bcc-stencil bg-ink px-5 py-2.5 text-cardstock transition disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Radio group
// ─────────────────────────────────────────────────────────────────────

interface RadioOption<T extends string> {
  value: T;
  label: string;
  blurb: string;
}

function RadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  options: ReadonlyArray<RadioOption<T>>;
  value: T;
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={
            "flex cursor-pointer items-start gap-3 border-2 px-3 py-2 transition " +
            (value === opt.value
              ? "border-blueprint bg-blueprint/15"
              : "border-cardstock-edge hover:border-ink/40")
          }
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            disabled={disabled}
            className="mt-1 accent-ink"
          />
          <span>
            <span className="bcc-mono block text-[11px] tracking-[0.14em] text-ink">
              {opt.label}
            </span>
            <span className="bcc-mono mt-1 block text-[10px] text-ink-soft">
              {opt.blurb}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
