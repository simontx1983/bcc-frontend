"use client";

/**
 * Composer — §D1 unified content-creation surface.
 *
 * Single component, two variants, two modes (v1.5):
 *
 *   variants:  "inline" | "modal"
 *   modes:     "status" | "review"
 *
 * Variant is presentation only. State + submit pipelines are identical
 * across both — no forks. The inline variant renders directly on the
 * Floor (and on a viewer's own per-user wall) for authed viewers; the
 * modal variant is launched from action entry points (today:
 * ReviewCallout) with the right defaultMode + reviewTargetId pre-set.
 *
 *   ┌──────── strict scope rule ──────────────────────────────────────┐
 *   │ The Composer handles content creation only. Pull, Endorse, and │
 *   │ Dispute are NOT modes here — they're either one-click signals  │
 *   │ (pull, endorse) or context-bound flows (dispute) with their    │
 *   │ own UX shape. Adding them back would dilute the surface.       │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * v1.5 changes:
 *   - The inline variant is no longer a cream-panel form with mode
 *     tabs. It's a quiet single-line idle row in the dark feed flow
 *     that expands on focus into a textarea + Publish + close-X.
 *     Phillip's framing: "the collapsed state should almost feel
 *     like a thought waiting to happen." PeepSo provides the
 *     storage primitive (peepso_activities) underneath; BCC owns
 *     the entire frontend identity.
 *   - The Blog tab is gone from this surface. Long-form is now an
 *     escalation path — an inline `Long-form →` link in the
 *     expanded composer routes to
 *     `/u/{handle}?tab=blog&blogsub=create`, which lands the author
 *     on the Blog tab's CREATE sub-tab inside their own profile.
 *     Different mindset, different context, by design.
 *
 * Review-mode contract (modal variant only in V1):
 *   - REQUIRES reviewTargetId (numeric page id) + reviewTargetName
 *   - Renders a "Reviewing @handle" header + locks the target (no
 *     mid-composer target switching in V1)
 *   - Adds a grade picker (trust / neutral / caution per §D2)
 *
 * Cache: each submit path invalidates the feed + highlights query
 * roots so a refetch surfaces the new post via the canonical
 * FeedRankingService hydration. No optimistic insert.
 */

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useCreatePostMutation } from "@/hooks/useCreatePost";
import { PhotoIcon } from "@/components/feed/actionIcons";
import { Avatar } from "@/components/identity/Avatar";
import { GifPicker } from "@/components/composer/GifPicker";
import { MentionPopover } from "@/components/composer/MentionPopover";
import { PhotoPicker } from "@/components/composer/PhotoPicker";
import {
  COMPOSER_PROMPTS,
  MENTION_LISTBOX_ID,
  useComposerState,
} from "@/components/composer/useComposerState";
import { humanizeError } from "@/components/composer/useComposerSubmit";
import { RankChip } from "@/components/profile/RankChip";
import { Dialog } from "@/components/ui/Dialog";
import { humanizeCode } from "@/lib/api/errors";
import { createReview } from "@/lib/api/posts-endpoints";
import {
  MENTIONS_PER_POST_MAX,
  REVIEW_BODY_MAX_LENGTH,
  STATUS_POST_MAX_LENGTH,
  type CardTier,
  type GroupPostVisibility,
  type ReviewGrade,
} from "@/lib/api/types";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";
import {
  USER_ACTIVITY_QUERY_KEY_ROOT,
  USER_REVIEWS_QUERY_KEY_ROOT,
} from "@/hooks/useUserActivity";

export type ComposerMode = "status" | "review";

export type ComposerVariant = "inline" | "modal";

export interface ComposerProps {
  /** Default tab. Inline variant always uses "status"; modal accepts both. */
  defaultMode?: ComposerMode;
  /** Review mode (entity target) — the page id being reviewed. Ignored otherwise. */
  reviewTargetId?: number;
  /**
   * Review mode (member target, Slice 2) — the user_id of the member being
   * reviewed. Mutually exclusive with reviewTargetId; when > 0 the review is
   * submitted with target_kind=user_profile and the server resolves the
   * self-page. Ignored otherwise.
   */
  reviewTargetUserId?: number;
  /** Required for review mode — the name shown in the "Reviewing @x" header. */
  reviewTargetName?: string;
  /** "inline" embeds in the page; "modal" wraps in a fixed-position overlay with backdrop + close. */
  variant?: ComposerVariant;
  /** Called on dismiss + on success. Required when variant === "modal"; inline callers pass it when they're hosting the composer inside their own Dialog (e.g. the New Post modal — see NewPostTrigger). */
  onClose?: () => void;
  /**
   * Inline variant only — mounts already expanded (textarea visible)
   * instead of the idle collapsed row. Used by NewPostTrigger's modal
   * and by the homepage's own `?compose=1` deep link (e.g. after a
   * guest signs in from the New Post redirect).
   */
  startExpanded?: boolean;
  /**
   * Inline variant only — drops the homepage-specific outer margin/
   * page-gutter since a host container (e.g. Dialog) already supplies
   * width/inset. Independent of `startExpanded`: the homepage's
   * `?compose=1` deep link wants startExpanded WITHOUT hosted (it's
   * still laid out on the page, not inside a modal). Used by
   * NewPostTrigger's modal.
   */
  hosted?: boolean;
  /**
   * Inline-variant props for the collapsed-row identity treatment.
   * All optional — when missing, the composer falls back to a quiet
   * initial-letter placeholder. Server-resolved per §A2 (the Floor
   * page SSR-fetches MemberProfile and threads it through; ActivityPanel
   * may omit and accept the fallback).
   */
  viewerAvatarUrl?: string | undefined;
  viewerHandle?: string | undefined;
  viewerDisplayName?: string | null | undefined;
  /**
   * §C1 card-tier slug + pre-rendered tier/rank labels for the
   * collapsed card's identity header (avatar + RankChip). Sourced
   * from the same MemberProfile fields the old FloorBriefing
   * IdentityRow used. Omitted entirely → header renders avatar +
   * name only, no RankChip.
   */
  viewerCardTier?: CardTier | undefined;
  viewerTierLabel?: string | null | undefined;
  viewerRankLabel?: string | undefined;
  /**
   * §4.7.6 — when present and > 0, posts authored from this composer
   * land inside that PeepSo group's wall (server sets `peepso_group_id`
   * post-meta + validates the viewer is an active member). Used by
   * `/groups/[slug]` to host an in-context composer above the group
   * feed. When omitted / 0, posts go to the viewer's own wall (the
   * default Floor / per-user-wall behavior). The composer also tucks
   * the "Long-form →" escalation link when group-scoped — long-form
   * blogs aren't group-scoped in V1.
   */
  groupId?: number;
  /**
   * Optional one-line scope label rendered as a kicker above the
   * collapsed placeholder when `groupId` is set (e.g. "POST IN
   * HOLDERS: JUPPETS"). Server-pinned text per §A2 / §L5; when omitted
   * the composer falls back to the bare placeholder.
   */
  groupScopeLabel?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Outer shell: variant-aware wrapper.
//
// Inline variant: dark-flow collapsed-idle composer. Status-only.
// Modal variant: cream-panel form with mode tabs + ESC close.
// ─────────────────────────────────────────────────────────────────────

export function Composer({
  defaultMode = "status",
  reviewTargetId,
  reviewTargetUserId,
  reviewTargetName,
  variant = "inline",
  onClose,
  startExpanded,
  hosted,
  viewerAvatarUrl,
  viewerHandle,
  viewerDisplayName,
  viewerCardTier,
  viewerTierLabel,
  viewerRankLabel,
  groupId,
  groupScopeLabel,
}: ComposerProps) {
  // Review tab is only available when a target (entity page OR member) is
  // supplied. Fail closed.
  const hasEntityTarget =
    typeof reviewTargetId === "number" && reviewTargetId > 0;
  const hasMemberTarget =
    typeof reviewTargetUserId === "number" && reviewTargetUserId > 0;
  const reviewAvailable =
    (hasEntityTarget || hasMemberTarget) &&
    typeof reviewTargetName === "string" &&
    reviewTargetName.length > 0;

  // Normalize groupId once: any non-positive value (undefined, 0,
  // negative) collapses to undefined so the InlineStatusComposer's
  // membership-required code path stays binary.
  const scopedGroupId = typeof groupId === "number" && groupId > 0 ? groupId : undefined;

  if (variant === "inline") {
    // Inline is status-only by design (v1.5). Review uses the modal
    // variant; long-form lives on the author's blog tab CREATE
    // sub-tab, behind the in-composer escalation link.
    return (
      <InlineStatusComposer
        viewerAvatarUrl={viewerAvatarUrl}
        viewerHandle={viewerHandle}
        viewerDisplayName={viewerDisplayName ?? null}
        viewerCardTier={viewerCardTier ?? null}
        viewerTierLabel={viewerTierLabel ?? null}
        viewerRankLabel={viewerRankLabel ?? ""}
        groupId={scopedGroupId}
        groupScopeLabel={groupScopeLabel}
        startExpanded={startExpanded}
        hosted={hosted}
        onClose={onClose}
      />
    );
  }

  // Modal variant — keeps the existing cardstock-panel form for review
  // composer flows + any future status-from-modal paths.
  const initialMode: ComposerMode =
    defaultMode === "review" && !reviewAvailable ? "status" : defaultMode;

  return (
    <Dialog
      title={
        initialMode === "review" && reviewAvailable
          ? `Write a review of ${reviewTargetName ?? ""}`
          : "Compose"
      }
      onClose={onClose ?? noop}
      panelClassName="max-w-2xl flex flex-col gap-3"
    >
      <ModalCore
        initialMode={initialMode}
        reviewTargetId={reviewAvailable && hasEntityTarget ? reviewTargetId : undefined}
        reviewTargetUserId={reviewAvailable && hasMemberTarget ? reviewTargetUserId : undefined}
        reviewTargetName={reviewAvailable ? reviewTargetName : undefined}
        reviewAvailable={reviewAvailable}
        onSubmitSuccess={onClose}
      />
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// InlineStatusComposer — v1.5 quiet-idle / focused-expanded composer.
//
// Two states:
//   - Collapsed (default): avatar chip + placeholder, sits in the dark
//     feed flow with a faint top/bottom border. Reads as "a thought
//     waiting to happen." Clicking anywhere on the row expands.
//   - Expanded: textarea + char counter + `Long-form →` link + Publish
//     button + close-X. The textarea autofocuses on expand.
//
// Click-outside collapses ONLY when the textarea is empty — never lose
// a draft to a stray click. ESC behaves the same. The X button always
// collapses + clears (explicit user intent to dismiss).
// ─────────────────────────────────────────────────────────────────────

interface InlineStatusComposerProps {
  viewerAvatarUrl: string | undefined;
  viewerHandle: string | undefined;
  viewerDisplayName: string | null;
  /** §C1 card-tier slug for the identity header's Avatar tint + RankChip rail. */
  viewerCardTier: CardTier;
  /** Pre-rendered §A2 tier display string, sr-only/tooltip only on RankChip. */
  viewerTierLabel: string | null;
  /** Pre-rendered rank display string. Empty → RankChip omitted. */
  viewerRankLabel: string;
  /**
   * §4.7.6 — when present, every submit (status / photo / GIF) carries
   * `group_id` so the post lands inside that group's wall. Membership
   * is enforced server-side; the parent (`GroupFeedSection`) is
   * responsible for not mounting this composer when the viewer isn't
   * a member.
   */
  groupId: number | undefined;
  /** Optional kicker copy rendered above the placeholder when group-scoped. */
  groupScopeLabel: string | undefined;
  /** See ComposerProps.startExpanded. */
  startExpanded?: boolean | undefined;
  /** See ComposerProps.hosted. */
  hosted?: boolean | undefined;
  /** See ComposerProps.onClose. */
  onClose?: (() => void) | undefined;
}

// Sprint 2 civic prompts + the §3.3.12 mention listbox id moved to
// useComposerState.ts in the Phase 3.3 split — they're part of the
// state machine's vocabulary and are re-imported above for the JSX.

// Seed/wallet-provisioned accounts carry WordPress's default
// display_name == user_login == "u_<handle>". Strip that artifact
// prefix wherever a display name or handle becomes user-facing text.
function stripSeedPrefix(value: string): string {
  return value.startsWith("u_") ? value.slice(2) : value;
}

// Render-only — leaves the rest of the string untouched (no full
// title-casing), so e.g. "tiamiyu" -> "Tiamiyu" but "u_van halen" ->
// "Van halen".
function capitalizeFirst(value: string): string {
  return value === "" ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

// §4.7.6 — group-post visibility options. Static copy only; the wire
// value (`key`) is forwarded verbatim and the server owns enforcement.
const VISIBILITY_OPTIONS: ReadonlyArray<{
  key: GroupPostVisibility;
  label: string;
  description: string;
}> = [
  {
    key: "members_only",
    label: "MEMBERS ONLY",
    description: "Only group members can see this.",
  },
  {
    key: "public_group",
    label: "PUBLIC GROUP",
    description: "Anyone can see it on the group page.",
  },
  {
    key: "public_all",
    label: "PUBLIC",
    description: "Shows in the group and the main feed.",
  },
];

function InlineStatusComposer({
  viewerAvatarUrl,
  viewerHandle,
  viewerDisplayName,
  viewerCardTier,
  viewerTierLabel,
  viewerRankLabel,
  groupId,
  groupScopeLabel,
  startExpanded,
  hosted,
  onClose,
}: InlineStatusComposerProps) {
  // Phase 3.3 split — the entire form state machine (expand/collapse,
  // prompt rotation, body + validation, photo/GIF attachment slots,
  // §3.3.12 mention detection, and the submit dispatch) lives in
  // useComposerState / useComposerSubmit. This component is render-only.
  const {
    expanded,
    setExpanded,
    promptIndex,
    setPromptPaused,
    content,
    setContent,
    error,
    setError,
    length,
    overCap,
    canSubmit,
    isPending,
    visibility,
    setVisibility,
    previewUrl,
    altText,
    setAltText,
    clearAttachment,
    handleFileSelect,
    selectedGif,
    gifPickerOpen,
    setGifPickerOpen,
    clearGif,
    handleGifSelect,
    giphyConfig,
    giphyEnabled,
    setCaretPos,
    mentionRanges,
    mentionTrigger,
    mentionPickerOpen,
    overMentionCap,
    mentionActiveOptionId,
    setMentionActiveOptionId,
    handleMentionSelect,
    syncCaretFromEvent,
    handleTextareaKeyDown,
    closeMentionPicker,
    containerRef,
    textareaRef,
    fileInputRef,
    handleSubmit,
    dismiss,
    hasPhoto,
    hasGif,
    hasAttachment,
    placeholder,
  } = useComposerState({ groupId, initialExpanded: startExpanded, onClose });

  // Identity-header label for the collapsed card: display name, else
  // handle, else nothing (bare-mount call sites like ActivityPanel pass
  // neither — the header degrades to avatar-only). Seed/wallet-provisioned
  // accounts ship WordPress's default display_name == user_login ==
  // "u_<handle>" until the member sets a real display name — strip that
  // artifact prefix so the header never shows a raw "u_" username.
  const identityLabel = capitalizeFirst(
    viewerDisplayName !== null && viewerDisplayName !== ""
      ? stripSeedPrefix(viewerDisplayName)
      : viewerHandle !== undefined && viewerHandle !== ""
        ? stripSeedPrefix(viewerHandle)
        : "",
  );
  const hasRank = viewerRankLabel !== "";

  return (
    <section
      ref={containerRef}
      // hosted implies a host container (e.g. Dialog) already supplies
      // width/inset — skip the homepage outer margin/gutter.
      className={"w-full " + (hosted === true ? "" : "mx-auto mt-2 max-w-3xl px-2 sm:mt-4 sm:px-3")}
      aria-label="Compose a status post"
    >
      {/*
        Composer-as-card: a single persistent bcc-panel that never
        unmounts across collapsed/expanded. An inner card holds the
        shared identity row (avatar + name + rank chip) plus the prompt
        row; the prompt row and the form below the inner card each
        animate open via a CSS grid 0fr<->1fr row (an "accordion"), so
        expand/collapse reads as one card opening, not two surfaces
        swapping. motion-safe gates the transition; reduced-motion users
        get an instant swap to the same end state.
      */}
      <div
        className={
          "bcc-panel flex flex-col rounded-2xl p-2 shadow-[var(--bcc-shadow-md)] transition-colors sm:p-3 " +
          (expanded ? "gap-2" : "gap-0 sm:gap-2") + " " +
          (hasAttachment ? "border-blueprint/40" : "")
        }
      >
        {groupScopeLabel !== undefined && groupScopeLabel !== "" && (
          <span
            className="bcc-mono text-cardstock-deep/80"
            style={{ fontSize: "9px", letterSpacing: "0.24em" }}
          >
            {groupScopeLabel}
          </span>
        )}

        <div
          className={
            "flex flex-col rounded-xl bg-[var(--bcc-surface-raised)] p-2 transition-colors sm:p-3 " +
            (expanded ? "" : "cursor-pointer hover:bg-[var(--bcc-surface-active)]")
          }
          onClick={() => {
            if (!expanded) setExpanded(true);
          }}
        >
          <div className={(expanded ? "flex" : "hidden sm:flex") + " items-center justify-between gap-3 pb-2"}>
            <div className="flex items-center gap-2.5">
              <Avatar
                avatarUrl={
                  viewerAvatarUrl !== undefined && viewerAvatarUrl !== ""
                    ? viewerAvatarUrl
                    : null
                }
                handle={viewerHandle ?? ""}
                displayName={viewerDisplayName}
                size="md"
                variant="rounded"
                tier={viewerCardTier ?? undefined}
                // Accent glow ring, matching the header avatar and the
                // sidebar's Newest Members / Suggested widgets.
                ringColor="var(--bcc-accent)"
              />
              {(identityLabel !== "" || hasRank || expanded) && (
                <div className="flex h-9 flex-col justify-between">
                  {identityLabel !== "" && (
                    <span
                      className={
                        "bcc-mono text-[12px] font-semibold tracking-[0.04em] text-[var(--bcc-text)] " +
                        (expanded ? "" : "hidden sm:inline")
                      }
                    >
                      {identityLabel}
                    </span>
                  )}
                  {!expanded && hasRank && (
                    <span className="hidden sm:inline-flex">
                      <RankChip
                        cardTier={viewerCardTier ?? null}
                        tierLabel={viewerTierLabel ?? null}
                        rankLabel={viewerRankLabel}
                        size="micro"
                        className="self-start"
                      />
                    </span>
                  )}
                  {expanded && (
                    // Design-only stub — where this post will be published.
                    // Not wired to any destination/visibility logic yet;
                    // revisit once the backend has a "post destinations"
                    // contract (see [[project-homepage-redesign]] deferred
                    // follow-up on the composer post-type/destination switcher).
                    <button
                      type="button"
                      aria-label="Post destination: the Floor"
                      title="Post destination (coming soon)"
                      className="bcc-mono inline-flex w-fit items-center gap-1 self-start rounded-full bg-[var(--bcc-surface-active)] px-2 py-[3px] text-[9px] tracking-[0.18em] text-[var(--bcc-text-secondary)] transition hover:bg-[var(--bcc-surface-hover)] hover:text-[var(--bcc-text)]"
                    >
                      FLOOR
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                        <path
                          d="M1.5 3L4 5.5L6.5 3"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            {expanded && (
              <button
                type="button"
                onClick={dismiss}
                aria-label="Discard draft"
                title="Discard draft"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--bcc-text-secondary)] transition hover:bg-[var(--bcc-surface-hover)] hover:text-[var(--bcc-text)]"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M3 3L13 13M13 3L3 13"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Prompt + Post row — single prompt rotates every 18s (group
              composer pins "Post to this group…"), pausing while
              hovered/focused. Collapses to nothing once the form opens. */}
          <div
            className={
              "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out " +
              (expanded ? "grid-rows-[0fr]" : "grid-rows-[1fr]")
            }
          >
            <div className="min-h-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                onMouseEnter={() => setPromptPaused(true)}
                onMouseLeave={() => setPromptPaused(false)}
                onFocus={() => setPromptPaused(true)}
                onBlur={() => setPromptPaused(false)}
                inert={expanded}
                className="flex w-full items-center gap-2.5 rounded-lg pt-0 pl-0 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bcc-accent)] sm:gap-3 sm:pt-1.5 sm:pl-[46px]"
              >
                {/* Mobile-only — at sm+ the header row above already
                    carries the avatar, so this would duplicate it. */}
                <span className="shrink-0 sm:hidden">
                  <Avatar
                    avatarUrl={
                      viewerAvatarUrl !== undefined && viewerAvatarUrl !== ""
                        ? viewerAvatarUrl
                        : null
                    }
                    handle={viewerHandle ?? ""}
                    displayName={viewerDisplayName}
                    size="md"
                    variant="rounded"
                    tier={viewerCardTier ?? undefined}
                    ringColor="var(--bcc-accent)"
                  />
                </span>
                {groupId !== undefined ? (
                  <span className="bcc-mono ml-1 min-w-0 flex-1 truncate text-xs tracking-[0.25em] text-[var(--bcc-text-secondary)] sm:ml-0 sm:tracking-[0.3em]">
                    Post to this group…
                  </span>
                ) : (
                  <span className="bcc-mono ml-1 min-w-0 flex-1 truncate text-xs tracking-[0.25em] text-[var(--bcc-text-secondary)] sm:ml-0 sm:tracking-[0.3em]">
                    What&apos;s the{" "}
                    <span
                      key={promptIndex}
                      className="motion-safe:animate-[bcc-fade-in_360ms_ease-out]"
                    >
                      {COMPOSER_PROMPTS[promptIndex] ?? COMPOSER_PROMPTS[0]}
                    </span>
                  </span>
                )}
                <span className="bcc-stencil inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--bcc-accent)] text-[11px] tracking-[0.18em] text-[var(--bcc-text-inverse)] shadow-[0_0_0_3px_var(--bcc-accent-subtle)] sm:h-auto sm:w-auto sm:px-4 sm:py-1.5 sm:shadow-none">
                  <span className="sr-only sm:not-sr-only">POST</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M14.5 1.5L7.5 8.5M14.5 1.5L10 14.5L7.5 8.5L1.5 6L14.5 1.5Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            </div>
          </div>

          {/* Expanded form — grows open from the same 0fr<->1fr grid trick. */}
          <form
            onSubmit={handleSubmit}
            inert={!expanded}
            className={
              "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out " +
              (expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
            }
          >
            <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <label htmlFor="composer-status-content" className="sr-only">
              {placeholder}
            </label>
            <textarea
              id="composer-status-content"
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setCaretPos(e.target.selectionEnd);
                if (error !== null) setError(null);
              }}
              // §3.3.12 — keep caretPos in lockstep with the textarea
              // so the mention-trigger detector reflects arrow-key
              // movement / mouse drag-positioning / focus restore.
              onSelect={syncCaretFromEvent}
              // §3.3.12 — atomic-token Backspace / Delete. The handler
              // returns early on non-Backspace/Delete keys, so other
              // bindings (Enter, etc.) still fall through to default.
              onKeyDown={handleTextareaKeyDown}
              placeholder={placeholder}
              rows={3}
              maxLength={STATUS_POST_MAX_LENGTH + 100}
              disabled={isPending}
              // ARIA combobox role wires the textarea to the popover
              // listbox so screen readers narrate "X of N" as the user
              // arrows through suggestions. The popover only mounts
              // when mentionPickerOpen is true; aria-expanded mirrors.
              // aria-activedescendant points at the currently-active
              // option's DOM id (reported back from MentionPopover) so
              // SR users hear the focused row as they arrow.
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={mentionPickerOpen}
              aria-controls={MENTION_LISTBOX_ID}
              aria-activedescendant={mentionActiveOptionId ?? undefined}
              // mt-2 (not pt-2 on the wrapper above) — padding on the
              // grid-collapsing wrapper itself can't be clipped away by
              // its own overflow-hidden when grid-rows-[0fr] forces it
              // to zero height (padding is part of the box, not
              // overflowing content), which left a permanent sliver at
              // the card's bottom edge when collapsed. A child's margin
              // is ordinary overflowing content and collapses cleanly.
              className="mt-2 w-full resize-none bg-transparent font-serif text-base text-[var(--bcc-text)] placeholder:text-[var(--bcc-text-muted)] focus:outline-none disabled:opacity-60"
            />

            {/*
              §3.3.12 mention popover — mounts directly under the
              textarea when the trigger is active. Anchored to the
              composer container so outside-click detection treats the
              whole composer surface as "inside" (clicking back into
              the textarea preserves the picker). Listbox id is the
              same constant the textarea points `aria-controls` at.
            */}
            {mentionPickerOpen && (
              <MentionPopover
                query={mentionTrigger.active ? mentionTrigger.query : ""}
                open={mentionPickerOpen}
                onSelect={handleMentionSelect}
                onClose={closeMentionPicker}
                anchorRef={containerRef}
                listboxId={MENTION_LISTBOX_ID}
                onActiveOptionChange={setMentionActiveOptionId}
              />
            )}

            {hasPhoto && previewUrl !== null && (
              <PhotoPicker
                previewUrl={previewUrl}
                altText={altText}
                onAltTextChange={setAltText}
                onRemove={clearAttachment}
                disabled={isPending}
              />
            )}

            {hasGif && selectedGif !== null && (
              <div className="relative inline-flex w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedGif.preview_url}
                  alt=""
                  decoding="async"
                  className="h-24 w-24 rounded-sm border border-[var(--bcc-border)] object-cover"
                />
                <button
                  type="button"
                  onClick={clearGif}
                  aria-label="Remove GIF"
                  className="bcc-mono absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--bcc-border)] bg-[var(--bcc-surface-active)] text-[10px] leading-none text-[var(--bcc-text)] hover:bg-safety"
                  title="Remove GIF"
                >
                  ×
                </button>
              </div>
            )}

            {gifPickerOpen && giphyConfig.data?.enabled === true && (
              <GifPicker
                config={giphyConfig.data}
                onSelect={handleGifSelect}
                onClose={() => setGifPickerOpen(false)}
              />
            )}

            {error !== null && (
              <p role="alert" className="bcc-mono text-[11px] text-safety">
                {error}
              </p>
            )}

            {/*
              §4.7.6 — group-post visibility selector. Only rendered for
              group-scoped composers; the global composer has no group to
              scope visibility against, so the field never surfaces (and is
              never sent). Mirrors the ReviewForm grade-picker pattern.
            */}
            {groupId !== undefined && (
              <fieldset className="flex flex-col gap-2">
                <legend className="bcc-mono text-[10px] tracking-[0.18em] text-[var(--bcc-text-muted)]">
                  VISIBILITY
                </legend>
                <div className="grid gap-2 md:grid-cols-3">
                  {VISIBILITY_OPTIONS.map((opt) => {
                    const active = visibility === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setVisibility(opt.key)}
                        aria-pressed={active}
                        className={
                          "rounded-sm border px-3 py-3 text-left transition motion-reduce:transition-none " +
                          (active
                            ? "border-[var(--bcc-accent)] bg-[var(--bcc-accent-subtle)]"
                            : "border-[var(--bcc-border)] bg-[var(--bcc-surface-hover)] hover:border-[var(--bcc-border-strong)]")
                        }
                      >
                        <span className="bcc-stencil block text-[12px] tracking-[0.2em] text-[var(--bcc-text)]">
                          {opt.label}
                        </span>
                        <span className="mt-1 block font-serif text-[13px] text-[var(--bcc-text-secondary)]">
                          {opt.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <footer className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                {/* Photo — leftmost in the footer per the "attachment
                    belongs closer to creation than publishing" product
                    call. Triggers the hidden file input. Disabled while a
                    write is in flight so a user can't swap files
                    mid-upload. */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  aria-label={hasPhoto ? "Replace photo" : "Attach a photo"}
                  title={hasPhoto ? "Replace photo" : "Attach a photo"}
                  className={
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-7 sm:w-7 " +
                    (hasPhoto
                      ? "border-[var(--bcc-accent)] bg-[var(--bcc-accent-subtle)] text-[var(--bcc-accent)]"
                      : "border-[var(--bcc-border)] text-[var(--bcc-text-secondary)] hover:border-[var(--bcc-border-strong)] hover:text-[var(--bcc-text)]")
                  }
                >
                  <PhotoIcon size={14} />
                </button>
                {/* GIF button — only mounts when the integration is
                    enabled. Toggles the inline picker. Disabled while a
                    write is in flight, same as Photo. "GIF" stays as a
                    text badge — there's no widely-recognized glyph for it. */}
                {giphyEnabled && (
                  <button
                    type="button"
                    onClick={() => setGifPickerOpen((open) => !open)}
                    disabled={isPending}
                    aria-label={hasGif ? "Replace GIF" : "Attach a GIF"}
                    aria-expanded={gifPickerOpen}
                    title={hasGif ? "Replace GIF" : "Attach a GIF"}
                    className={
                      "bcc-mono inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-7 sm:w-7 " +
                      (hasGif || gifPickerOpen
                        ? "border-[var(--bcc-accent)] bg-[var(--bcc-accent-subtle)] text-[var(--bcc-accent)]"
                        : "border-[var(--bcc-border)] text-[var(--bcc-text-secondary)] hover:border-[var(--bcc-border-strong)] hover:text-[var(--bcc-text)]")
                    }
                  >
                    GIF
                  </button>
                )}
                {/* Poll / Location — visual stubs for the planned
                    attachment types, disabled until the backend supports
                    them. */}
                <button
                  type="button"
                  disabled
                  aria-label="Poll — coming soon"
                  title="Poll — coming soon"
                  className="inline-flex h-6 w-6 shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-[var(--bcc-border)] text-[var(--bcc-text-muted)] opacity-50 sm:h-7 sm:w-7"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 13V7" />
                    <path d="M8 13V3" />
                    <path d="M13 13V9" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="Location — coming soon"
                  title="Location — coming soon"
                  className="inline-flex h-6 w-6 shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-[var(--bcc-border)] text-[var(--bcc-text-muted)] opacity-50 sm:h-7 sm:w-7"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M8 14.5C8 14.5 13 10.5 13 6.5C13 3.74 10.76 1.5 8 1.5C5.24 1.5 3 3.74 3 6.5C3 10.5 8 14.5 8 14.5Z" />
                    <circle cx="8" cy="6.5" r="1.75" />
                  </svg>
                </button>
                <span
                  className={
                    "bcc-mono min-w-0 truncate text-[11px] " +
                    (overCap
                      ? "text-safety"
                      : length > STATUS_POST_MAX_LENGTH - 50
                        ? "text-warning"
                        : "text-[var(--bcc-text-muted)]")
                  }
                >
                  {length} / {STATUS_POST_MAX_LENGTH}
                  {hasPhoto && (
                    <span className="ml-2 hidden text-[var(--bcc-text-secondary)] sm:inline">· 1 photo</span>
                  )}
                  {hasGif && (
                    <span className="ml-2 hidden text-[var(--bcc-text-secondary)] sm:inline">· 1 GIF</span>
                  )}
                  {mentionRanges.length > 0 && (
                    <span
                      className={`ml-2 hidden sm:inline ${overMentionCap ? "text-safety" : "text-[var(--bcc-text-secondary)]"}`}
                    >
                      · {mentionRanges.length} / {MENTIONS_PER_POST_MAX} mentions
                    </span>
                  )}
                </span>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className={
                  "bcc-stencil inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] tracking-[0.18em] transition sm:px-4 " +
                  (canSubmit
                    ? "bg-[var(--bcc-accent)] text-[var(--bcc-text-inverse)] hover:opacity-90"
                    : "cursor-not-allowed bg-[var(--bcc-surface-active)] text-[var(--bcc-text-muted)]")
                }
              >
                {isPending ? "POSTING…" : "POST"}
                {!isPending && (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M14.5 1.5L7.5 8.5M14.5 1.5L10 14.5L7.5 8.5L1.5 6L14.5 1.5Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </footer>

            {/* Hidden native file input. The visible Photo button forwards
                clicks via the ref. `accept` keeps the OS picker filtered
                to the same mime allowlist the server enforces; the
                client-side validator in handleFileSelect re-checks
                because `accept` is hint-only and not authoritative. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileSelect}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </form>
        </div>
      </div>
    </section>
  );
}

// Sprint 2 — local ComposerAvatar + resolveAvatarInitial removed.
// The composer now consumes the shared <Avatar /> primitive
// (components/identity/Avatar.tsx); initials derivation lives in
// lib/format/initials.ts. This was the last inline-avatar leftover
// that Sprint 1's consolidation pass had to defer because the
// composer's expanded/collapsed sites required the rotation/ring
// work that arrived in Sprint 2.

// ─────────────────────────────────────────────────────────────────────
// Modal core: shared state + tab strip for status/review modes.
//
// The Blog mode was lifted out of this surface in v1.5 and now lives
// on the author's blog tab CREATE sub-tab. The modal still hosts
// status (rare) + review (the primary modal entry from ReviewCallout).
// ─────────────────────────────────────────────────────────────────────

interface ModalCoreProps {
  initialMode: ComposerMode;
  reviewTargetId: number | undefined;
  reviewTargetUserId: number | undefined;
  reviewTargetName: string | undefined;
  reviewAvailable: boolean;
  onSubmitSuccess: (() => void) | undefined;
}

function ModalCore({
  initialMode,
  reviewTargetId,
  reviewTargetUserId,
  reviewTargetName,
  reviewAvailable,
  onSubmitSuccess,
}: ModalCoreProps) {
  const [mode, setMode] = useState<ComposerMode>(initialMode);

  // Resolve the discriminated review target — member takes precedence
  // (the two are mutually exclusive at the Composer boundary).
  const reviewTarget: ReviewTarget | null =
    reviewTargetUserId !== undefined
      ? { kind: "member", userId: reviewTargetUserId }
      : reviewTargetId !== undefined
        ? { kind: "entity", pageId: reviewTargetId }
        : null;

  return (
    <>
      <ComposerTabs
        mode={mode}
        onChange={setMode}
        reviewAvailable={reviewAvailable}
      />
      {mode === "status" && <StatusForm onSubmitSuccess={onSubmitSuccess} />}
      {mode === "review" && reviewAvailable && reviewTarget !== null && (
        <ReviewForm
          target={reviewTarget}
          targetName={reviewTargetName ?? ""}
          onSubmitSuccess={onSubmitSuccess}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tab strip — modal variant only (inline is single-mode).
// ─────────────────────────────────────────────────────────────────────

interface ComposerTabsProps {
  mode: ComposerMode;
  onChange: (next: ComposerMode) => void;
  reviewAvailable: boolean;
}

function ComposerTabs({ mode, onChange, reviewAvailable }: ComposerTabsProps) {
  const tabs = useMemo(() => {
    const list: Array<{ key: ComposerMode; label: string; blurb: string; available: boolean }> = [
      { key: "status", label: "Update", blurb: "Quick post — 500 chars.", available: true },
      { key: "review", label: "Review", blurb: "Grade + reasoning.",      available: reviewAvailable },
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
// StatusForm — used by the modal variant. The inline variant has its
// own collapsed/expanded shape (InlineStatusComposer) and does not
// reuse this form.
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
      <label htmlFor="composer-modal-status-content" className="sr-only">
        What&apos;s happening on the floor?
      </label>
      <textarea
        id="composer-modal-status-content"
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

/**
 * Review-surface error copy (§γ: each call site owns its copy map;
 * never render err.message).
 *
 * `bcc_forbidden` here is the VOTE-pipeline denial, not the
 * write_review gate: PostsService::createReview surfaces every
 * VoteEligibilityException as bcc_forbidden — the downvote tier gate
 * ("trusted or elite only"), the identity-verification gate, the daily
 * downvote cap, and the fraud/coordination gates
 * (bcc-trust app/Domain/Core/Services/Vote/VoteEligibilityChecker.php).
 * The composer-wide humanizeError copy ("keep watching cards…")
 * describes the write_review unlock, which can't fire from this form —
 * ReviewCallout only opens the modal when `can_review` is already true.
 * So the copy leads with the gates that CAN fire. If the backend ever
 * grows distinct codes per gate (it should), split this entry.
 */
function humanizeReviewError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to post a review.",
      bcc_invalid_request: "That review can't be sent — check the grade and body.",
      bcc_forbidden:
        "This review was blocked by a trust-safety gate. Caution reviews require trusted or elite standing and a verified identity (linked wallet or GitHub), and downvotes are capped daily.",
      bcc_rate_limited: "Slow down — wait a moment before posting again.",
      bcc_unavailable: "Reviews are temporarily unavailable. Try again shortly.",
    },
    "Couldn't post your review. Try again.",
  );
}

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

/**
 * A review target is either an entity card (page id) or a member
 * (user id, Slice 2). The submit shape differs only in which field the
 * server resolves; the grade→vote mapping stays server-side.
 */
type ReviewTarget =
  | { kind: "entity"; pageId: number }
  | { kind: "member"; userId: number };

function ReviewForm({
  target,
  targetName,
  onSubmitSuccess,
}: {
  target: ReviewTarget;
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
  const targetReady =
    target.kind === "entity" ? target.pageId > 0 : target.userId > 0;
  const canSubmit = grade !== null && !isEmpty && !overCap && !pending && targetReady;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || grade === null) return;

    setPending(true);
    setError(null);
    try {
      // Two explicit calls so each literal matches one union member
      // exactly (a ternary widens the target fields and trips excess-
      // property checking against the discriminated union).
      if (target.kind === "entity") {
        await createReview({ target_page_id: target.pageId, grade, content: trimmed });
      } else {
        await createReview({ target_kind: "user_profile", target_user_id: target.userId, grade, content: trimmed });
      }
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      // Member reviews land on the target's self-page → refresh their
      // "reviews on file" list so the new entry surfaces.
      if (target.kind === "member") {
        void queryClient.invalidateQueries({ queryKey: USER_REVIEWS_QUERY_KEY_ROOT });
      }
      onSubmitSuccess?.();
    } catch (err) {
      setError(humanizeReviewError(err));
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
        <h3 className="bcc-stencil mt-1 text-2xl text-bcc-text">{targetName}</h3>
        <p className="mt-2 font-serif text-bcc-text-secondary">
          Your read goes on the record — trust scores update, others see your reasoning. Be specific.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
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
          className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary"
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
          className="bcc-mono mt-1.5 min-h-[100px] w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60 sm:min-h-[140px]"
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
// Helpers
// ─────────────────────────────────────────────────────────────────────

function noop(): void {
  /* placeholder when modal variant is mounted without an onClose */
}

// §3.3.12 mention helpers, the mention listbox id, and humanizeError
// moved to useComposerState.ts / useComposerSubmit.ts in the Phase 3.3
// god-component split.
