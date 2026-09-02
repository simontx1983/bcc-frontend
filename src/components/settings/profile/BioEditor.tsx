"use client";

/**
 * BioEditor — the missing half of a feature that was already wired.
 *
 * `PATCH /me/profile` has always accepted `bio` (`PatchProfileBody.bio`,
 * `MyProfileEndpoint::patch`), and the public profile already renders it
 * through `BioBox` and `Person.description`. What was missing was any UI
 * to write it: `BioBox`'s owner empty state links to `?tab=profile` with a
 * "WRITE ONE →" call to action, and that tab had no bio field. This closes
 * that loop. No new endpoint, no contract change.
 *
 * ## Why there is no client-side length check
 *
 * The server caps the bio at 500 **bytes**, measured with `strlen()` AFTER
 * `sanitize_textarea_field()` has run (MyProfileEndpoint.php:210-217) —
 * even though its error text says "characters".
 *
 * JavaScript cannot reproduce `sanitize_textarea_field`, so any local guard
 * would be measuring a different string than the one the server measures.
 * It would also produce false rejections: 600 bytes of markup that
 * sanitises down to 200 is accepted by the server and would be blocked
 * here. `maxLength` is absent for the same reason — it counts UTF-16 code
 * units, so an emoji-heavy bio could sit under the attribute's limit while
 * being well over 500 bytes.
 *
 * The server is therefore the only validator, and its rejection is mapped
 * to our own wording. We do not echo the server's "500 characters" string:
 * repeating a limit we know is measured in bytes would pass on a falsehood.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  SettingsSaveStatus,
  saveStatusFrom,
} from "@/components/settings/SettingsSaveStatus";
import { useDirtyRegistration } from "@/hooks/useDirtyRegistration";
import { useUpdateBio } from "@/hooks/useUpdateProfile";
import { BccApiError, type MemberProfile } from "@/lib/api/types";

/**
 * `bcc_invalid_request` on THIS mutation can only mean the bio was too
 * long: the endpoint's other two producers of that code are a non-string
 * `bio` and a body with no fields at all, and this form always sends a
 * string `bio`.
 */
const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request: "Your bio is too long. Shorten it and try again.",
  bcc_unauthorized:    "Sign in required.",
  bcc_internal_error:  "Server error. Try again.",
};

function humanizeError(err: BccApiError | Error): string {
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Couldn't save your bio. Try again.";
  }
  return "Couldn't save your bio. Try again.";
}

export interface BioEditorProps {
  profile: MemberProfile;
}

export function BioEditor({ profile }: BioEditorProps) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;

  const [draft, setDraft] = useState(profile.bio);
  // The last bio the server confirmed. Not the prop: `profile` is a
  // server-component prop refreshed asynchronously, so comparing against it
  // would report dirty for the whole refresh window after a save.
  const [savedBio, setSavedBio] = useState(profile.bio);
  const [serverError, setServerError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const searchParams = useSearchParams();
  const focusRequested = searchParams?.get("focus") === "bio";
  const focusHandled = useRef(false);

  const mutation = useUpdateBio({
    onSuccess: (data) => {
      // Both, from the server's own copy. The server sanitises, so the
      // stored value can differ from what was typed — setting only the
      // baseline would leave the field permanently dirty against a draft
      // the server never accepted.
      setSavedBio(data.bio);
      setDraft(data.bio);
      setServerError(null);
    },
    onError: (err: BccApiError | Error) => {
      // Draft and baseline both untouched, so the row stays dirty and the
      // user's text survives.
      setServerError(humanizeError(err));
    },
  });

  const isDirty = draft !== savedBio;

  useDirtyRegistration({
    id: "profile.bio",
    label: "your bio",
    isDirty,
    isSaving: mutation.isPending,
  });

  // Arriving from BioBox's "WRITE ONE →". Consume the parameter once, then
  // strip it so a later tab change (which rebuilds the query string from
  // window.location.search) can't re-trigger the focus.
  useEffect(() => {
    if (!focusRequested || focusHandled.current) return;
    focusHandled.current = true;

    const el = textareaRef.current;
    if (el !== null) {
      el.focus();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }

    const params = new URLSearchParams(window.location.search);
    params.delete("focus");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query === "" ? window.location.pathname : `${window.location.pathname}?${query}`,
    );
  }, [focusRequested]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || !isDirty) return;
    setServerError(null);
    mutation.mutate({ bio: draft });
  }

  const status = serverError !== null ? "idle" : saveStatusFrom(mutation);

  return (
    <div className="bcc-panel p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label
          htmlFor={fieldId}
          className="bcc-mono text-[11px] tracking-[0.16em] text-bcc-text"
        >
          ABOUT YOU
        </label>
        <p id={helpId} className="bcc-mono text-[10px] text-bcc-text-secondary">
          A short introduction shown at the top of your profile.
        </p>
        <textarea
          id={fieldId}
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setServerError(null);
          }}
          disabled={mutation.isPending}
          rows={4}
          aria-describedby={helpId}
          placeholder="What do you work on?"
          className="w-full resize-y border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="bcc-mono min-h-[1rem] text-[10px]">
            {/* Progress and success ride the polite region; a failure is an
                alert and `status` is forced to idle, so one outcome is
                never announced by two regions. */}
            <SettingsSaveStatus status={status} />
            {serverError !== null && (
              <p role="alert" className="mt-1 text-safety">
                {serverError}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={mutation.isPending || !isDirty}
            className="bcc-stencil bg-ink px-4 py-1.5 text-[11px] text-cardstock transition disabled:opacity-40"
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
