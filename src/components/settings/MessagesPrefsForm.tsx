"use client";

/**
 * MessagesPrefsForm — §V2 Phase 2 messaging settings.
 *
 * Two toggles backed by PeepSo's per-user keys:
 *   - chat_enabled       (peepso_chat_enabled)       — master on/off
 *   - chat_friends_only  (peepso_chat_friends_only)  — restrict to friends
 *
 * Same draft + save shape as NotificationPrefsForm: changes accumulate
 * in local state and only land on the server when the user clicks
 * Save. No optimistic update — the response is the source of truth.
 *
 * When chat is OFF entirely, the friends-only toggle is disabled (UI
 * state only — server still accepts the value, but it's meaningless
 * while master is off).
 */

import { type FormEvent, useEffect, useState } from "react";

import {
  useMessagesPrefs,
  useUpdateMessagesPrefs,
} from "@/hooks/useMessagesPrefs";
import { BccApiError } from "@/lib/api/types";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request: "We couldn't accept that change. Try again.",
  bcc_unauthorized:    "Sign in required.",
  bcc_internal_error:  "Server error. Try again.",
};

function humanize(err: BccApiError | Error): string {
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? err.message;
  }
  return "Something went wrong. Try again.";
}

interface DraftState {
  chat_enabled: boolean;
  chat_friends_only: boolean;
}

export function MessagesPrefsForm() {
  const query = useMessagesPrefs();
  const mutation = useUpdateMessagesPrefs({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanize(err));
    },
  });

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Seed local draft from query data on first load and after a save
  // replaces the cache with the server's authoritative state.
  useEffect(() => {
    if (query.data === undefined) return;
    setDraft({
      chat_enabled: query.data.chat_enabled,
      chat_friends_only: query.data.chat_friends_only,
    });
  }, [query.data]);

  if (query.isLoading || draft === null) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-ink-soft">Loading messages preferences…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="bcc-panel p-6">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load messages preferences:{" "}
          {humanize(query.error)}
        </p>
      </div>
    );
  }

  const isUnchanged =
    query.data !== undefined &&
    draft.chat_enabled === query.data.chat_enabled &&
    draft.chat_friends_only === query.data.chat_friends_only;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUnchanged || mutation.isPending || draft === null) return;
    setServerError(null);
    setSavedAt(null);
    mutation.mutate(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="bcc-panel p-6">
        <h2 className="bcc-stencil text-xl text-ink">Direct messages</h2>
        <p className="bcc-mono mt-1 text-[11px] text-ink-soft">
          Control who can start a chat with you. Changes apply
          immediately when you save.
        </p>

        <div className="mt-5 flex flex-col gap-5">
          <ToggleRow
            label="Allow direct messages"
            blurb="Turn this off to disable chat entirely. People who try to start a conversation will be told you have messaging disabled."
            checked={draft.chat_enabled}
            onChange={(value) => setDraft({ ...draft, chat_enabled: value })}
            disabled={mutation.isPending}
          />

          <ToggleRow
            label="Only friends can message me"
            blurb="When enabled, only your confirmed PeepSo friends can start a new conversation. Existing conversations stay open. Has no effect when direct messages are off."
            checked={draft.chat_friends_only}
            onChange={(value) => setDraft({ ...draft, chat_friends_only: value })}
            disabled={mutation.isPending || !draft.chat_enabled}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4">
        {serverError !== null && (
          <span role="alert" className="bcc-mono text-safety">
            {serverError}
          </span>
        )}
        {savedAt !== null && serverError === null && (
          <span
            role="status"
            className="bcc-mono"
            style={{ color: "var(--verified)" }}
          >
            Saved.
          </span>
        )}
        <button
          type="submit"
          disabled={isUnchanged || mutation.isPending}
          className="bcc-stencil bg-ink px-5 py-2.5 text-cardstock transition disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

interface ToggleRowProps {
  label: string;
  blurb: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, blurb, checked, onChange, disabled = false }: ToggleRowProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 cursor-pointer accent-ink"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="bcc-mono text-[12px] text-ink">{label}</span>
        <span className="bcc-mono text-[11px] text-ink-soft">{blurb}</span>
      </span>
    </label>
  );
}
