"use client";

/**
 * IdentitySettingsForm — handle-change form for /settings/identity.
 *
 * §B6 client-side validation mirrors the server (3–20 chars, lowercase
 * a–z + digits + single hyphens, no leading/trailing/consecutive
 * hyphens). Server is still the authoritative validator — this is
 * just for instant feedback.
 *
 * Cooldown handling:
 *   - On a successful rename, the server returns `next_change_at`
 *     (ISO 8601 UTC). We hold that in local state and disable the
 *     submit until it elapses. A small relative-time string ("5d 3h")
 *     reads from the same value.
 *   - On a 429 (`bcc_rate_limited`), the server's Retry-After header
 *     is what's authoritative — but bccFetch doesn't surface headers,
 *     so for V1 we just show the error text. Refresh restores the
 *     cooldown state from the next /users/:handle viewer-aware
 *     payload (a follow-up for when the page wires it).
 *
 * No optimistic update — the rename is rare, the rules are strict, and
 * a flicker between guess + server-truth would confuse more than help.
 */

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { useUpdateHandle } from "@/hooks/useUpdateHandle";
import { BccApiError } from "@/lib/api/types";

// §B6 — same regex used at signup. Centralizing this is V1.5 cleanup.
const HANDLE_REGEX = /^[a-z0-9](?:(?!--)[a-z0-9-])*[a-z0-9]$/;

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_handle:
    "Handle must be 3–20 chars, lowercase letters, digits, or hyphens, with no leading, trailing, or consecutive hyphens.",
  bcc_handle_reserved: "That handle is reserved.",
  bcc_conflict:        "That handle is already taken.",
  bcc_rate_limited:    "Handle can only be changed once every 7 days.",
  bcc_unauthorized:    "Sign in required.",
  bcc_internal_error:  "Server error. Try again.",
};

interface IdentitySettingsFormProps {
  currentHandle: string;
}

export function IdentitySettingsForm({ currentHandle }: IdentitySettingsFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(currentHandle);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ handle: string; next_change_at: string | null } | null>(null);

  const trimmed = draft.trim().toLowerCase();
  const isClientValid =
    trimmed.length >= 3 && trimmed.length <= 20 && HANDLE_REGEX.test(trimmed);
  const isUnchanged = trimmed === currentHandle.toLowerCase();

  const mutation = useUpdateHandle({
    onSuccess: (data) => {
      setServerError(null);
      setConfirmed({ handle: data.handle, next_change_at: data.next_change_at });
      // Refresh the server component above so the page header re-reads
      // session.user.handle. Without this the page would still render
      // the previous handle until a hard reload.
      router.refresh();
    },
    onError: (err) => {
      setConfirmed(null);
      if (err instanceof BccApiError) {
        setServerError(ERROR_COPY[err.code] ?? err.message);
      } else {
        setServerError("Couldn't update handle. Try again.");
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isClientValid || isUnchanged || mutation.isPending) return;
    setServerError(null);
    setConfirmed(null);
    mutation.mutate(trimmed);
  }

  const cooldown = useCooldown(confirmed?.next_change_at ?? null);

  return (
    <div className="bcc-panel p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="bcc-mono text-ink-soft">Handle</span>
          <div className="flex items-center border border-cardstock-edge bg-cardstock-deep/60 focus-within:border-blueprint focus-within:ring-1 focus-within:ring-blueprint">
            <span className="bcc-mono pl-3 text-ink-soft">@</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={20}
              autoComplete="username"
              pattern="[a-z0-9\-]{3,20}"
              value={draft}
              onChange={(event) => setDraft(event.target.value.toLowerCase())}
              className="flex-1 bg-transparent px-2 py-2 font-serif text-ink outline-none"
            />
          </div>
          <span className={`bcc-mono ${isClientValid || trimmed === "" ? "text-ink-soft/70" : "text-safety"}`}>
            3–20 chars · a–z, 0–9, hyphens · no leading/trailing/double hyphen
          </span>
        </label>

        <div className="flex items-center justify-between gap-4">
          <span className="bcc-mono text-[10px] text-ink-soft/70">
            Currently <span className="text-ink">@{currentHandle}</span>
          </span>
          <button
            type="submit"
            disabled={
              !isClientValid ||
              isUnchanged ||
              mutation.isPending ||
              cooldown.active
            }
            className="bcc-stencil bg-ink px-5 py-2.5 text-cardstock transition disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save handle"}
          </button>
        </div>

        {serverError !== null && (
          <p role="alert" className="bcc-mono text-safety">
            {serverError}
          </p>
        )}

        {confirmed !== null && serverError === null && (
          <p
            role="status"
            className="bcc-mono text-verified"
            style={{ color: "var(--verified)" }}
          >
            Saved — you&apos;re now @{confirmed.handle}.
            {cooldown.active && cooldown.remaining !== "" && (
              <> Next change available in {cooldown.remaining}.</>
            )}
          </p>
        )}
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// useCooldown — derives "X d Y h" from an ISO 8601 timestamp + ticks
// once a minute so the displayed remaining time stays current. Returns
// `active=false` when the timestamp is null or already in the past.
// ─────────────────────────────────────────────────────────────────────

function useCooldown(nextChangeAtIso: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (nextChangeAtIso === null) return;
    const handle = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(handle);
  }, [nextChangeAtIso]);

  if (nextChangeAtIso === null) {
    return { active: false, remaining: "" };
  }
  const target = Date.parse(nextChangeAtIso);
  if (Number.isNaN(target)) {
    return { active: false, remaining: "" };
  }
  const ms = target - now;
  if (ms <= 0) {
    return { active: false, remaining: "" };
  }
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const remaining = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return { active: true, remaining };
}
