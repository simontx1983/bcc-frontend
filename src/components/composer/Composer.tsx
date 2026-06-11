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
import Link from "next/link";
import type { Route } from "next";
import { useQueryClient } from "@tanstack/react-query";

import { useCreatePostMutation } from "@/hooks/useCreatePost";
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
import { Dialog } from "@/components/ui/Dialog";
import { createReview } from "@/lib/api/posts-endpoints";
import {
  BLOG_EXCERPT_MAX_LENGTH,
  BLOG_EXCERPT_MIN_LENGTH,
  BLOG_FULL_TEXT_MAX_LENGTH,
  MENTIONS_PER_POST_MAX,
  REVIEW_BODY_MAX_LENGTH,
  STATUS_POST_MAX_LENGTH,
  type GroupPostVisibility,
  type ReviewGrade,
} from "@/lib/api/types";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";

export type ComposerMode = "status" | "review";

export type ComposerVariant = "inline" | "modal";

export interface ComposerProps {
  /** Default tab. Inline variant always uses "status"; modal accepts both. */
  defaultMode?: ComposerMode;
  /** Required for review mode — the page id being reviewed. Ignored otherwise. */
  reviewTargetId?: number;
  /** Required for review mode — the page name shown in the "Reviewing @x" header. */
  reviewTargetName?: string;
  /** "inline" embeds in the page; "modal" wraps in a fixed-position overlay with backdrop + close. */
  variant?: ComposerVariant;
  /** Required when variant === "modal". Called on dismiss + on success. */
  onClose?: () => void;
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
  reviewTargetName,
  variant = "inline",
  onClose,
  viewerAvatarUrl,
  viewerHandle,
  viewerDisplayName,
  groupId,
  groupScopeLabel,
}: ComposerProps) {
  // Review tab is only available when a target is supplied. Fail closed.
  const reviewAvailable =
    typeof reviewTargetId === "number" &&
    reviewTargetId > 0 &&
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
        groupId={scopedGroupId}
        groupScopeLabel={groupScopeLabel}
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
        reviewTargetId={reviewAvailable ? reviewTargetId : undefined}
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
}

// Sprint 2 civic prompts + the §3.3.12 mention listbox id moved to
// useComposerState.ts in the Phase 3.3 split — they're part of the
// state machine's vocabulary and are re-imported above for the JSX.

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
  groupId,
  groupScopeLabel,
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
    animatedOpen,
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
  } = useComposerState({ groupId });

  return (
    <section
      ref={containerRef}
      className="mx-auto max-w-2xl px-4 sm:px-8"
      aria-label="Compose a status post"
    >
      {!expanded ? (
        // ────── Collapsed / idle state ─────────────────────────────
        // Sprint 2 — "the room acknowledged the operator":
        //   - Viewer Avatar at left anchors the row in identity.
        //   - Hairline phosphor ring appears on hover/focus, not on
        //     idle. The row is quiet until the operator looks at it.
        //   - Single prompt rotates every 18s (group composer pins
        //     "Post to this group…" — group context is the prompt).
        //     Rotation halts while paused (hover/focus) so the
        //     operator never has to read a moving target.
        <button
          type="button"
          onClick={() => setExpanded(true)}
          onMouseEnter={() => setPromptPaused(true)}
          onMouseLeave={() => setPromptPaused(false)}
          onFocus={() => setPromptPaused(true)}
          onBlur={() => setPromptPaused(false)}
          className="flex w-full items-center gap-3 border-y border-cardstock/10 bg-transparent px-1 py-3 text-left transition hover:bg-cardstock/5 hover:shadow-[inset_0_0_0_1px_rgba(125,255,154,0.18)] focus-visible:bg-cardstock/5 focus-visible:shadow-[inset_0_0_0_1px_rgba(125,255,154,0.28)] focus-visible:outline-none motion-safe:transition-shadow motion-safe:duration-200"
        >
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
          />
          <span className="flex flex-col">
            {groupScopeLabel !== undefined && groupScopeLabel !== "" && (
              <span
                className="bcc-mono text-cardstock-deep/80"
                style={{ fontSize: "9px", letterSpacing: "0.24em" }}
              >
                {groupScopeLabel}
              </span>
            )}
            <span
              key={promptIndex}
              className="font-serif italic text-cardstock-deep/75 motion-safe:animate-[bcc-fade-in_360ms_ease-out]"
            >
              {groupId !== undefined
                ? "Post to this group…"
                : COMPOSER_PROMPTS[promptIndex] ?? COMPOSER_PROMPTS[0]}
            </span>
          </span>
        </button>
      ) : (
        // ────── Expanded state ──────────────────────────────────────
        // Slight elevation via a thin border + faint background.
        // No cardstock cream surface — stays in the dark zone so
        // the composer never visually competes with the cream feed
        // cards below it.
        <form
          onSubmit={handleSubmit}
          className={
            "flex flex-col gap-3 border-y bg-cardstock/5 px-3 py-3 transition-colors sm:px-4 " +
            // Visual-shift on attachment: warmer border accent signals
            // "this post now contains media" without going loud.
            (hasAttachment
              ? "border-blueprint/40 "
              : "border-cardstock-edge/30 ") +
            // Expand-in transition. Starts collapsed (max-h-0,
            // opacity-0) on mount and flips open after the first
            // paint via the `animatedOpen` rAF effect above. The
            // 400px ceiling covers the 280-char status post; longer
            // overflow is an acceptable one-frame artifact (see plan
            // risks). motion-safe gates the entire treatment so
            // reduced-motion users get the instant swap.
            "motion-safe:overflow-hidden motion-safe:transition-[max-height,opacity] motion-safe:duration-200 motion-safe:ease-out " +
            (animatedOpen
              ? "motion-safe:max-h-[400px] motion-safe:opacity-100"
              : "motion-safe:max-h-0 motion-safe:opacity-0")
          }
        >
          <header className="flex items-center gap-3">
            <Avatar
              avatarUrl={
                viewerAvatarUrl !== undefined && viewerAvatarUrl !== ""
                  ? viewerAvatarUrl
                  : null
              }
              handle={viewerHandle ?? ""}
              displayName={viewerDisplayName}
              size="sm"
              variant="rounded"
            />
            <span className="bcc-mono text-[11px] tracking-[0.18em] text-cardstock-deep">
              {viewerDisplayName !== null && viewerDisplayName !== ""
                ? viewerDisplayName.toUpperCase()
                : viewerHandle !== undefined && viewerHandle !== ""
                  ? `@${viewerHandle.toUpperCase()}`
                  : "POSTING"}
            </span>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close composer"
              className="bcc-mono ml-auto text-[10px] tracking-[0.24em] text-cardstock-deep/70 hover:text-cardstock"
            >
              ESC
            </button>
          </header>

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
            className="w-full resize-none bg-transparent font-serif text-base text-cardstock placeholder:text-cardstock-deep/40 focus:outline-none disabled:opacity-60"
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
                className="h-24 w-24 rounded-sm border border-cardstock-edge/40 object-cover"
              />
              <button
                type="button"
                onClick={clearGif}
                aria-label="Remove GIF"
                className="bcc-mono absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cardstock-edge/60 bg-ink text-[10px] leading-none text-cardstock hover:bg-safety hover:text-cardstock"
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
              <legend className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep/80">
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
                          ? "border-cardstock bg-cardstock/10"
                          : "border-cardstock-edge/30 bg-cardstock/[0.03] hover:border-cardstock-edge/60")
                      }
                    >
                      <span className="bcc-stencil block text-[12px] tracking-[0.2em] text-cardstock">
                        {opt.label}
                      </span>
                      <span className="mt-1 block font-serif text-[13px] text-cardstock-deep/80">
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              {/* 📷 attach affordance — leftmost in the footer per the
                  "attachment belongs closer to creation than publishing"
                  product call. Triggers the hidden file input. The
                  button is disabled while a write is in flight so a
                  user can't swap files mid-upload. */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                aria-label={hasPhoto ? "Replace photo" : "Attach a photo"}
                title={hasPhoto ? "Replace photo" : "Attach a photo"}
                className={
                  "inline-flex h-7 w-7 items-center justify-center rounded-full border text-base leading-none transition disabled:cursor-not-allowed disabled:opacity-50 " +
                  (hasPhoto
                    ? "border-blueprint/60 bg-cardstock/10 text-cardstock"
                    : "border-cardstock-edge/40 text-cardstock-deep/80 hover:border-cardstock-edge hover:text-cardstock")
                }
              >
                <span aria-hidden>📷</span>
              </button>
              {/* GIF button — only mounts when the integration is
                  enabled. Toggles the inline picker. Disabled while a
                  write is in flight, same as 📷. */}
              {giphyEnabled && (
                <button
                  type="button"
                  onClick={() => setGifPickerOpen((open) => !open)}
                  disabled={isPending}
                  aria-label={hasGif ? "Replace GIF" : "Attach a GIF"}
                  aria-expanded={gifPickerOpen}
                  title={hasGif ? "Replace GIF" : "Attach a GIF"}
                  className={
                    "bcc-mono inline-flex h-7 items-center rounded-full border px-2 text-[10px] tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 " +
                    (hasGif || gifPickerOpen
                      ? "border-blueprint/60 bg-cardstock/10 text-cardstock"
                      : "border-cardstock-edge/40 text-cardstock-deep/80 hover:border-cardstock-edge hover:text-cardstock")
                  }
                >
                  GIF
                </button>
              )}
              <span
                className={
                  "bcc-mono text-[11px] " +
                  (overCap
                    ? "text-safety"
                    : length > STATUS_POST_MAX_LENGTH - 50
                      ? "text-warning"
                      : "text-cardstock-deep/60")
                }
              >
                {length} / {STATUS_POST_MAX_LENGTH}
                {hasPhoto && (
                  <span className="ml-2 text-cardstock-deep/80">· 1 photo</span>
                )}
                {hasGif && (
                  <span className="ml-2 text-cardstock-deep/80">· 1 GIF</span>
                )}
                {mentionRanges.length > 0 && (
                  <span
                    className={`ml-2 ${overMentionCap ? "text-safety" : "text-cardstock-deep/80"}`}
                  >
                    · {mentionRanges.length} / {MENTIONS_PER_POST_MAX} mentions
                  </span>
                )}
              </span>
              {/*
                §4.7.6 — long-form blogs are personal-wall content in
                V1; the blog tab's CREATE sub-tab has no group-scope
                concept. Tucking the escalation link when the composer
                is group-scoped avoids surfacing a path that would
                silently drop the group affiliation. Also requires
                viewerHandle so the deep-link can target the author's
                own blog page.
              */}
              {groupId === undefined &&
                viewerHandle !== undefined &&
                viewerHandle !== "" && (
                <Link
                  href={`/u/${viewerHandle}?tab=blog&blogsub=create` as Route}
                  className="bcc-mono text-[11px] tracking-[0.18em] text-cardstock-deep/80 hover:text-cardstock hover:underline"
                >
                  Long-form →
                </Link>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className={
                "bcc-stencil rounded-sm px-5 py-1.5 text-[12px] tracking-[0.2em] transition " +
                (canSubmit
                  ? "bg-cardstock text-ink hover:bg-blueprint hover:text-cardstock"
                  : "cursor-not-allowed bg-cardstock-deep/40 text-cardstock-deep/60")
              }
            >
              {isPending ? "POSTING…" : "POST"}
            </button>
          </footer>

          {/* Hidden native file input. The visible 📷 button forwards
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
        </form>
      )}
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
  reviewTargetName: string | undefined;
  reviewAvailable: boolean;
  onSubmitSuccess: (() => void) | undefined;
}

function ModalCore({
  initialMode,
  reviewTargetId,
  reviewTargetName,
  reviewAvailable,
  onSubmitSuccess,
}: ModalCoreProps) {
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
// BlogForm — §D6 long-form post.
//
// Lifted out of the inline composer in v1.5; now mounted exclusively
// inside the blog tab's CREATE sub-tab (see BlogTabClient). Exported
// so the sub-tab can reuse it without a parallel implementation.
// ─────────────────────────────────────────────────────────────────────

export function BlogForm({
  onSubmitSuccess,
}: {
  onSubmitSuccess?: () => void;
}) {
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
          className="bcc-mono min-h-[120px] w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60 sm:min-h-[160px]"
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
// Helpers
// ─────────────────────────────────────────────────────────────────────

function noop(): void {
  /* placeholder when modal variant is mounted without an onClose */
}

// §3.3.12 mention helpers, the mention listbox id, and humanizeError
// moved to useComposerState.ts / useComposerSubmit.ts in the Phase 3.3
// god-component split.
