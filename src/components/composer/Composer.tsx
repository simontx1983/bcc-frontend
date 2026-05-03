"use client";

/**
 * Composer — §D1 unified content-creation surface.
 *
 * Single component, two variants, three modes.
 *
 *   variants:  "inline" | "modal"
 *   modes:     "status" | "review" | "blog"
 *
 * Variant is presentation only. State + submit pipelines are identical
 * across both — no forks. The inline variant renders directly on the
 * Floor for authed viewers; the modal variant is launched from action
 * entry points (today: ReviewCallout) with the right defaultMode +
 * reviewTargetId pre-set.
 *
 *   ┌──────── strict scope rule ──────────────────────────────────────┐
 *   │ The Composer handles content creation only. Pull, Endorse, and │
 *   │ Dispute are NOT modes here — they're either one-click signals  │
 *   │ (pull, endorse) or context-bound flows (dispute) with their    │
 *   │ own UX shape. Adding them back would dilute the surface.       │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Review-mode contract:
 *   - REQUIRES reviewTargetId (numeric page id) + reviewTargetName
 *   - Disables the Review tab + submit when missing
 *   - Renders a "Reviewing @handle" header + locks the target (no
 *     mid-composer target switching in V1)
 *   - Adds a grade picker (trust / neutral / caution per §D2)
 *
 * Other modes ignore reviewTargetId.
 *
 * Tab order (frequency-first):
 *   1. Update  — quick text post (default for the Floor)
 *   2. Review  — only when invoked with a target
 *   3. Blog    — long-form (excerpt + body)
 *
 * Announce (post-as-entity per §D3) is deliberately deferred — the
 * backend /posts endpoint has no entity-identity parameter, so the
 * tab would be dead even when shown. Lands when /posts gains a
 * post_as_entity_id field.
 *
 * Cache: each submit path invalidates the feed + highlights query
 * roots so a refetch surfaces the new post via the canonical
 * FeedRankingService hydration. No optimistic insert.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useCreatePostMutation } from "@/hooks/useCreatePost";
import { createReview } from "@/lib/api/posts-endpoints";
import {
  BccApiError,
  BLOG_EXCERPT_MAX_LENGTH,
  BLOG_EXCERPT_MIN_LENGTH,
  BLOG_FULL_TEXT_MAX_LENGTH,
  REVIEW_BODY_MAX_LENGTH,
  STATUS_POST_MAX_LENGTH,
  type ReviewGrade,
} from "@/lib/api/types";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";

export type ComposerMode = "status" | "review" | "blog";

export type ComposerVariant = "inline" | "modal";

export interface ComposerProps {
  /** Default tab. Falls back to "status" for inline, the supplied mode otherwise. */
  defaultMode?: ComposerMode;
  /** Required for review mode — the page id being reviewed. Ignored otherwise. */
  reviewTargetId?: number;
  /** Required for review mode — the page name shown in the "Reviewing @x" header. */
  reviewTargetName?: string;
  /** "inline" embeds in the page; "modal" wraps in a fixed-position overlay with backdrop + close. */
  variant?: ComposerVariant;
  /** Required when variant === "modal". Called on dismiss + on success. */
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────
// Outer shell: variant-aware wrapper around the same inner state.
// ─────────────────────────────────────────────────────────────────────

export function Composer({
  defaultMode = "status",
  reviewTargetId,
  reviewTargetName,
  variant = "inline",
  onClose,
}: ComposerProps) {
  // Review tab is only available when a target is supplied. If the
  // caller passes defaultMode="review" without a target, fall back to
  // status — fail closed rather than render a broken review form.
  const reviewAvailable =
    typeof reviewTargetId === "number" &&
    reviewTargetId > 0 &&
    typeof reviewTargetName === "string" &&
    reviewTargetName.length > 0;

  const initialMode: ComposerMode =
    defaultMode === "review" && !reviewAvailable ? "status" : defaultMode;

  const inner = (
    <ComposerCore
      initialMode={initialMode}
      reviewTargetId={reviewAvailable ? reviewTargetId : undefined}
      reviewTargetName={reviewAvailable ? reviewTargetName : undefined}
      reviewAvailable={reviewAvailable}
      onSubmitSuccess={onClose}
    />
  );

  if (variant === "modal") {
    return (
      <ModalShell
        title={
          initialMode === "review" && reviewAvailable
            ? `Write a review of ${reviewTargetName ?? ""}`
            : "Compose"
        }
        onClose={onClose ?? noop}
      >
        {inner}
      </ModalShell>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-8 pb-6">
      <div className="bcc-panel flex flex-col gap-3 p-5">{inner}</div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Core: shared state, tab strip, and per-mode forms. Variant-agnostic.
// ─────────────────────────────────────────────────────────────────────

interface ComposerCoreProps {
  initialMode: ComposerMode;
  reviewTargetId: number | undefined;
  reviewTargetName: string | undefined;
  reviewAvailable: boolean;
  /** Called after a successful submit (e.g. close the modal). */
  onSubmitSuccess: (() => void) | undefined;
}

function ComposerCore({
  initialMode,
  reviewTargetId,
  reviewTargetName,
  reviewAvailable,
  onSubmitSuccess,
}: ComposerCoreProps) {
  const [mode, setMode] = useState<ComposerMode>(initialMode);

  return (
    <>
      <ComposerTabs
        mode={mode}
        onChange={setMode}
        reviewAvailable={reviewAvailable}
      />
      {mode === "status" && <StatusForm onSubmitSuccess={onSubmitSuccess} />}
      {mode === "review" && reviewAvailable && reviewTargetId !== undefined && (
        <ReviewForm
          targetId={reviewTargetId}
          targetName={reviewTargetName ?? ""}
          onSubmitSuccess={onSubmitSuccess}
        />
      )}
      {mode === "blog" && <BlogForm onSubmitSuccess={onSubmitSuccess} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tab strip
// ─────────────────────────────────────────────────────────────────────

interface ComposerTabsProps {
  mode: ComposerMode;
  onChange: (next: ComposerMode) => void;
  reviewAvailable: boolean;
}

function ComposerTabs({ mode, onChange, reviewAvailable }: ComposerTabsProps) {
  const tabs = useMemo(() => {
    const list: Array<{ key: ComposerMode; label: string; blurb: string; available: boolean }> = [
      { key: "status", label: "Update", blurb: "Quick post — 500 chars.",     available: true },
      { key: "review", label: "Review", blurb: "Grade + reasoning.",           available: reviewAvailable },
      { key: "blog",   label: "Blog",   blurb: "Long-form — excerpt + body.",  available: true },
    ];
    return list;
  }, [reviewAvailable]);

  return (
    <div role="tablist" aria-label="Composer mode" className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        if (!tab.available) return null;
        const active = mode === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={
              "bcc-mono inline-flex flex-col items-start gap-0.5 border-2 px-3 py-1.5 text-[11px] tracking-[0.18em] transition " +
              (active
                ? "border-ink bg-ink text-cardstock"
                : "border-cardstock-edge bg-cardstock-deep/40 text-ink-soft hover:border-ink/50 hover:text-ink")
            }
          >
            <span className="uppercase">{tab.label}</span>
            <span className="text-[9px] tracking-[0.12em] opacity-70 normal-case">
              {tab.blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StatusForm
// ─────────────────────────────────────────────────────────────────────

function StatusForm({ onSubmitSuccess }: { onSubmitSuccess: (() => void) | undefined }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreatePostMutation({
    onSuccess: () => {
      setContent("");
      setError(null);
      onSubmitSuccess?.();
    },
    onError: (err) => setError(humanizeError(err)),
  });

  const trimmed = content.trim();
  const length = content.length;
  const overCap = length > STATUS_POST_MAX_LENGTH;
  const isEmpty = trimmed === "";
  const canSubmit = !isEmpty && !overCap && !mutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    mutation.mutate({ content: trimmed });
  };

  const counterTone = overCap
    ? "text-safety"
    : length > STATUS_POST_MAX_LENGTH - 50
      ? "text-warning"
      : "text-cardstock-deep/70";

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      aria-label="Compose a status post"
    >
      <label htmlFor="composer-status-content" className="sr-only">
        What&apos;s happening on the floor?
      </label>
      <textarea
        id="composer-status-content"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          if (error !== null) setError(null);
        }}
        placeholder="What's happening on the floor?"
        rows={3}
        maxLength={STATUS_POST_MAX_LENGTH + 100}
        disabled={mutation.isPending}
        className="bcc-mono min-h-[72px] w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`bcc-mono text-[11px] ${counterTone}`}>
          {length} / {STATUS_POST_MAX_LENGTH}
          {overCap && (
            <span className="ml-2">(over the cap by {length - STATUS_POST_MAX_LENGTH})</span>
          )}
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          className={
            "bcc-stencil rounded-sm px-5 py-2 text-[12px] tracking-[0.2em] transition " +
            (canSubmit
              ? "bg-ink text-cardstock hover:bg-blueprint"
              : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
          }
        >
          {mutation.isPending ? "Posting…" : "POST TO THE FLOOR"}
        </button>
      </div>

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
        </p>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ReviewForm — locked target + grade picker + body. The review mode
// contract is enforced here: the form refuses to submit without a
// resolved target, and the target name renders unmistakably so the
// reviewer can never mis-target their post.
// ─────────────────────────────────────────────────────────────────────

const REVIEW_GRADE_OPTIONS: ReadonlyArray<{
  key: ReviewGrade;
  label: string;
  description: string;
  accent: string;
}> = [
  { key: "trust",   label: "TRUST",   description: "I'd recommend this validator to others.", accent: "var(--verified)" },
  { key: "neutral", label: "NEUTRAL", description: "Mixed feelings — some pros, some concerns.", accent: "var(--blueprint)" },
  { key: "caution", label: "CAUTION", description: "Others should know what I've seen here.",  accent: "var(--safety)" },
];

function ReviewForm({
  targetId,
  targetName,
  onSubmitSuccess,
}: {
  targetId: number;
  targetName: string;
  onSubmitSuccess: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [grade, setGrade] = useState<ReviewGrade | null>(null);
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = content.trim();
  const length = content.length;
  const overCap = length > REVIEW_BODY_MAX_LENGTH;
  const isEmpty = trimmed === "";
  const canSubmit = grade !== null && !isEmpty && !overCap && !pending && targetId > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || grade === null) return;

    setPending(true);
    setError(null);
    try {
      await createReview({
        target_page_id: targetId,
        grade,
        content: trimmed,
      });
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      onSubmitSuccess?.();
    } catch (err) {
      setError(humanizeError(err));
      setPending(false);
    }
  };

  const counterTone = overCap
    ? "text-safety"
    : length > REVIEW_BODY_MAX_LENGTH - 200
      ? "text-warning"
      : "text-cardstock-deep/70";

  return (
    <form
      onSubmit={(e) => { void handleSubmit(e); }}
      className="flex flex-col gap-5"
      aria-label={`Review of ${targetName}`}
    >
      <div>
        <p className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          REVIEWING //
        </p>
        <h3 className="bcc-stencil mt-1 text-2xl text-ink">{targetName}</h3>
        <p className="mt-2 font-serif text-ink-soft">
          Your read goes on the record — trust scores update, others see your reasoning. Be specific.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
          YOUR READ
        </legend>
        <div className="grid gap-2 md:grid-cols-3">
          {REVIEW_GRADE_OPTIONS.map((opt) => {
            const active = grade === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setGrade(opt.key)}
                aria-pressed={active}
                className={
                  "rounded-sm border px-3 py-3 text-left transition " +
                  (active
                    ? "border-ink bg-cardstock"
                    : "border-cardstock-edge/30 bg-cardstock/30 hover:border-cardstock-edge/60")
                }
                style={active ? { boxShadow: `inset 0 -3px 0 ${opt.accent}` } : {}}
              >
                <span
                  className="bcc-stencil block text-[12px] tracking-[0.2em]"
                  style={{ color: opt.accent }}
                >
                  {opt.label}
                </span>
                <span className="mt-1 block font-serif text-[13px] text-ink-soft">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="composer-review-body"
          className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft"
        >
          YOUR REASONING
        </label>
        <textarea
          id="composer-review-body"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (error !== null) setError(null);
          }}
          placeholder="What you saw. Specific events. Why others should care."
          rows={6}
          maxLength={REVIEW_BODY_MAX_LENGTH + 200}
          disabled={pending}
          className="bcc-mono mt-1.5 min-h-[140px] w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
        />
        <p className={`bcc-mono mt-1 text-[11px] ${counterTone}`}>
          {length} / {REVIEW_BODY_MAX_LENGTH}
          {overCap && <span className="ml-2">(over by {length - REVIEW_BODY_MAX_LENGTH})</span>}
        </p>
      </div>

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          className={
            "bcc-stencil rounded-sm px-5 py-2.5 text-[12px] tracking-[0.2em] transition " +
            (canSubmit
              ? "bg-ink text-cardstock hover:bg-blueprint"
              : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
          }
        >
          {pending ? "POSTING REVIEW…" : "POST REVIEW"}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BlogForm — §D6 long-form post.
// ─────────────────────────────────────────────────────────────────────

function BlogForm({ onSubmitSuccess }: { onSubmitSuccess: (() => void) | undefined }) {
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreatePostMutation({
    onSuccess: () => {
      setExcerpt("");
      setBody("");
      setError(null);
      onSubmitSuccess?.();
    },
    onError: (err) => setError(humanizeError(err)),
  });

  const excerptTrimmed = excerpt.trim();
  const bodyTrimmed = body.trim();
  const excerptLen = excerpt.length;
  const bodyLen = body.length;

  const excerptOverCap = excerptLen > BLOG_EXCERPT_MAX_LENGTH;
  const excerptUnderMin = excerptTrimmed.length < BLOG_EXCERPT_MIN_LENGTH;
  const bodyOverCap = bodyLen > BLOG_FULL_TEXT_MAX_LENGTH;
  const bodyEmpty = bodyTrimmed === "";

  const canSubmit =
    !excerptOverCap &&
    !excerptUnderMin &&
    !bodyOverCap &&
    !bodyEmpty &&
    !mutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    mutation.mutate({
      kind: "blog",
      excerpt: excerptTrimmed,
      content: bodyTrimmed,
    });
  };

  const excerptTone = excerptOverCap
    ? "text-safety"
    : excerptLen > BLOG_EXCERPT_MAX_LENGTH - 50
      ? "text-warning"
      : "text-cardstock-deep/70";
  const bodyTone = bodyOverCap
    ? "text-safety"
    : bodyLen > BLOG_FULL_TEXT_MAX_LENGTH - 1000
      ? "text-warning"
      : "text-cardstock-deep/70";

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      aria-label="Compose a blog post"
    >
      <label className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
          EXCERPT (Floor teaser · {BLOG_EXCERPT_MIN_LENGTH}–{BLOG_EXCERPT_MAX_LENGTH} chars)
        </span>
        <textarea
          value={excerpt}
          onChange={(e) => {
            setExcerpt(e.target.value);
            if (error !== null) setError(null);
          }}
          placeholder="One sentence that pulls people into the full post."
          rows={2}
          maxLength={BLOG_EXCERPT_MAX_LENGTH + 100}
          disabled={mutation.isPending}
          className="bcc-mono w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
        />
        <span className={`bcc-mono text-[11px] ${excerptTone}`}>
          {excerptLen} / {BLOG_EXCERPT_MAX_LENGTH}
          {excerptUnderMin && excerptLen > 0 && (
            <span className="ml-2">(need at least {BLOG_EXCERPT_MIN_LENGTH})</span>
          )}
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
          BODY (full post · rendered in your blog tab)
        </span>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (error !== null) setError(null);
          }}
          placeholder="Write something worth the click."
          rows={10}
          maxLength={BLOG_FULL_TEXT_MAX_LENGTH + 1000}
          disabled={mutation.isPending}
          className="bcc-mono min-h-[160px] w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
        />
        <span className={`bcc-mono text-[11px] ${bodyTone}`}>
          {bodyLen} / {BLOG_FULL_TEXT_MAX_LENGTH}
          {bodyOverCap && (
            <span className="ml-2">(over the cap by {bodyLen - BLOG_FULL_TEXT_MAX_LENGTH})</span>
          )}
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          className={
            "bcc-stencil rounded-sm px-5 py-2 text-[12px] tracking-[0.2em] transition " +
            (canSubmit
              ? "bg-ink text-cardstock hover:bg-blueprint"
              : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
          }
        >
          {mutation.isPending ? "Publishing…" : "PUBLISH BLOG POST"}
        </button>
      </div>

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
        </p>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal shell — local idiom shared with OpenDisputeModal /
// PanelVoteModal until the design system grows a real <Dialog>. ESC
// + backdrop click both close.
// ─────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bcc-panel relative flex w-full max-w-2xl flex-col gap-3 p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bcc-mono absolute right-4 top-4 text-[10px] tracking-[0.24em] text-cardstock-deep hover:text-ink"
        >
          ESC
        </button>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function humanizeError(err: unknown): string {
  if (err instanceof BccApiError) {
    switch (err.code) {
      case "bcc_unauthorized":
        return "Sign in to post.";
      case "bcc_forbidden":
        return (
          err.message ||
          "You haven't unlocked this yet — keep pulling cards and writing on the Floor."
        );
      case "bcc_invalid_request":
        return err.message || "That post can't be sent — check the content.";
      case "bcc_rate_limited":
        return "Slow down — wait a moment before posting again.";
      case "bcc_unavailable":
        return "Posts are temporarily unavailable. Try again shortly.";
      default:
        return err.message || "Couldn't send your post. Try again.";
    }
  }
  return "Something went wrong. Try again.";
}

function noop(): void {
  /* placeholder when modal variant is mounted without an onClose */
}
