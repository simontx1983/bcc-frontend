"use client";

/**
 * F-346 Repost and Quote pills — after Share in the action row (Handoff v1
 * note 34), the X model:
 *   - REPOST toggles the viewer's one PLAIN repost of the post: a tap
 *     reposts, a second tap undoes.
 *   - QUOTE opens a composer and can be used any number of times; each
 *     quote is a new post with its own text.
 *
 * Every state comes from the item, decided by the server:
 *   - `permissions.can_repost` / `can_quote` — absent (a backend without
 *     reposts) or a denial with no hint: no control. A denial WITH a hint
 *     (sign in, join the group): shown disabled with the hint. Already
 *     reposted is not a denial; the Repost pill stays live as the undo.
 *   - `viewer_has_reposted` — the Repost pill's pressed state (plain only:
 *     having quoted does not press it).
 *   - `repost_count` / `quote_count` — the figures; null = unknown, so no
 *     number.
 * An item's repost fields are keyed on its ROOT, so on a repost card both
 * pills describe — and act on — the original.
 */

import { memo, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";

import { QuoteIcon, RepostIcon } from "@/components/feed/actionIcons";
import { HIT_AREA_44 } from "@/components/feed/hitArea";
import { Dialog } from "@/components/ui/Dialog";
import { useCreateQuoteRepost, useToggleRepost } from "@/hooks/useRepost";
import { humanizeCode } from "@/lib/api/errors";
import type { FeedItem, FeedItemPermission } from "@/lib/api/types";
import { unlockHint } from "@/lib/permissions";

/** Server cap on a quote: 500 characters after trimming (the status cap). */
const QUOTE_MAX_LENGTH = 500;

const SHARED_ERROR_COPY: Record<string, string> = {
  bcc_unauthorized: "Sign in to repost.",
  bcc_forbidden: "Your account can’t repost right now.",
  bcc_not_found: "This post is no longer available.",
};

/**
 * Which of the two pills the server lets this viewer see, and how.
 * `null` = no control.
 */
function pillState(item: FeedItem, cap: "can_repost" | "can_quote"): { allowed: boolean; hint: string | null } | null {
  const perm: FeedItemPermission | undefined = item.permissions[cap];
  if (perm === undefined) return null;
  if (perm.allowed) return { allowed: true, hint: null };
  const hint = unlockHint(item.permissions, cap);
  return hint === null ? null : { allowed: false, hint };
}

function Pill({
  icon,
  text,
  count,
  label,
  pressed,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  text: string;
  count: number | null | undefined;
  label: string;
  pressed?: boolean | undefined;
  disabled: boolean;
  onClick: () => void;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // The card's click-to-open handler already skips buttons; stop here too.
    event.stopPropagation();
    onClick();
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={
        `${HIT_AREA_44} bcc-mono inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors duration-150 hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-success)] disabled:cursor-not-allowed disabled:opacity-60 ` +
        (pressed === true ? "text-[var(--bcc-success)]" : "text-[var(--bcc-text-secondary)]")
      }
    >
      <span className="inline-flex">{icon}</span>
      <span className="hidden sm:inline">{text}</span>
      {typeof count === "number" && count > 0 && <span>{count}</span>}
    </button>
  );
}

export const RepostButton = memo(function RepostButton({ item }: { item: FeedItem }) {
  const state = pillState(item, "can_repost");
  // The write hook lives in RepostToggle, so a card with no control (every
  // card, on a backend without reposts) runs no mutation observer.
  return state === null ? null : <RepostToggle item={item} allowed={state.allowed} hint={state.hint} />;
});

function RepostToggle({ item, allowed, hint }: { item: FeedItem; allowed: boolean; hint: string | null }) {
  const toggle = useToggleRepost();
  // `disabled` lags a render behind `isPending`, so a fast double tap could
  // otherwise send the same write twice (the second would 409 or 404).
  const inFlight = useRef(false);
  useEffect(() => {
    if (!toggle.isPending) inFlight.current = false;
  }, [toggle.isPending]);
  const state = { allowed, hint };

  const reposted = item.viewer_has_reposted === true;
  const label = !state.allowed ? `Repost. ${state.hint ?? ""}` : reposted ? "Undo your repost" : "Repost";
  const error = toggle.error
    ? humanizeCode(
        toggle.error,
        {
          ...SHARED_ERROR_COPY,
          bcc_conflict: "You’ve already reposted this.",
          bcc_rate_limited: "Too many reposts in a short time. Try again in a minute.",
          bcc_unavailable: "Reposting is unavailable right now, and nothing changed. Try again shortly.",
          // DELETE 404 = no plain repost of yours (another tab undid it).
          ...(toggle.variables?.reposted === true ? { bcc_not_found: "There is no repost of yours to undo." } : {}),
        },
        "Couldn’t update your repost. Try again in a moment.",
      )
    : null;

  return (
    <>
      <Pill
        icon={<RepostIcon />}
        text={reposted ? "Reposted" : "Repost"}
        count={item.repost_count}
        label={label}
        pressed={state.allowed ? reposted : undefined}
        disabled={!state.allowed || toggle.isPending}
        onClick={() => {
          if (inFlight.current) return;
          inFlight.current = true;
          toggle.mutate({ feedId: item.id, reposted });
        }}
      />
      {error !== null && (
        // Its own line under the action row (the footer wraps).
        <p role="alert" className="bcc-mono basis-full text-[11px] text-bcc-text-error">
          {error}
        </p>
      )}
    </>
  );
}

export const QuoteButton = memo(function QuoteButton({ item }: { item: FeedItem }) {
  const [composing, setComposing] = useState(false);
  const state = pillState(item, "can_quote");
  if (state === null) return null;

  return (
    <>
      <Pill
        icon={<QuoteIcon />}
        text="Quote"
        count={item.quote_count}
        label={state.allowed ? "Quote this post" : `Quote. ${state.hint ?? ""}`}
        disabled={!state.allowed}
        onClick={() => setComposing(true)}
      />
      {composing && <QuoteDialog feedId={item.id} onDone={() => setComposing(false)} />}
    </>
  );
});

/** Mounted only while open, so a feed of cards runs no quote mutation observers. */
function QuoteDialog({ feedId, onDone }: { feedId: string; onDone: () => void }) {
  const mut = useCreateQuoteRepost();
  const [draft, setDraft] = useState("");
  // Belt-and-braces with `disabled`: a second click landing before the
  // re-render that disables Post must not send a second quote.
  const inFlight = useRef(false);
  useEffect(() => {
    if (!mut.isPending) inFlight.current = false;
  }, [mut.isPending]);

  const trimmed = draft.trim();
  const tooLong = trimmed.length > QUOTE_MAX_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !mut.isPending;
  const fieldId = `quote-${feedId}`;
  const errorMessage = mut.error
    ? humanizeCode(
        mut.error,
        {
          ...SHARED_ERROR_COPY,
          bcc_invalid_request: `A quote needs 1 to ${QUOTE_MAX_LENGTH} characters.`,
          bcc_too_many_mentions: "That quote mentions too many people.",
          // Quotes share the posting limit, which is stricter than reposts'.
          bcc_rate_limited: "Too many posts in a short time. Try again in a couple of minutes.",
          bcc_unavailable: "Posting is unavailable right now, and nothing was posted. Try again shortly.",
        },
        "Couldn’t post your quote. Try again in a moment.",
      )
    : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    mut.mutate({ feedId, body: trimmed }, { onSuccess: onDone });
  };

  const close = () => {
    if (!mut.isPending) onDone();
  };

  return (
    <Dialog title="Quote" onClose={close} closeDisabled={mut.isPending} panelClassName="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="font-serif text-base text-bcc-text">
          Your quote goes on your wall with this post attached, seen by the audience your posts usually have.
        </p>
        <label htmlFor={fieldId} className="bcc-mono text-[11px] text-bcc-text-secondary">
          Your quote
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          // A little above the cap so a paste is not silently cut; the
          // counter and `canSubmit` hold the real limit.
          maxLength={QUOTE_MAX_LENGTH + 100}
          disabled={mut.isPending}
          aria-invalid={tooLong || errorMessage !== null}
          className="w-full rounded-[4px] border border-bcc-border bg-transparent px-4 py-3 font-serif text-bcc-text"
          style={{ fontSize: "16px", lineHeight: 1.5 }}
        />
        <span
          className={`bcc-mono self-end text-[11px] ${tooLong ? "text-bcc-text-error" : "text-bcc-text-secondary"}`}
          aria-live="polite"
        >
          {trimmed.length}/{QUOTE_MAX_LENGTH}
        </span>
        {errorMessage !== null && (
          <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
            {errorMessage}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={close}
            disabled={mut.isPending}
            className="bcc-btn bcc-btn-outline bcc-btn-sm text-bcc-text disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="bcc-btn bcc-btn-primary bcc-btn-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mut.isPending ? "POSTING…" : "POST QUOTE"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
