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

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQueryClient } from "@tanstack/react-query";

import {
  useCreateGifPostMutation,
  useCreatePhotoPostMutation,
  useCreatePostMutation,
} from "@/hooks/useCreatePost";
import { useSetPhotoAltMutation } from "@/hooks/useSetPhotoAlt";
import { useGiphyIntegration } from "@/hooks/useGiphyIntegration";
import { Avatar } from "@/components/identity/Avatar";
import { GifPicker } from "@/components/composer/GifPicker";
import { MentionPopover } from "@/components/composer/MentionPopover";
import { humanizeCode } from "@/lib/api/errors";
import { createReview } from "@/lib/api/posts-endpoints";
import {
  BccApiError,
  BLOG_EXCERPT_MAX_LENGTH,
  BLOG_EXCERPT_MIN_LENGTH,
  BLOG_FULL_TEXT_MAX_LENGTH,
  buildMentionToken,
  MENTIONS_PER_POST_MAX,
  PHOTO_ALLOWED_MIME_TYPES,
  PHOTO_ALT_MAX_LENGTH,
  PHOTO_MAX_BYTES,
  REVIEW_BODY_MAX_LENGTH,
  STATUS_POST_MAX_LENGTH,
  type GiphySearchResult,
  type MentionSearchCandidate,
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
    <ModalShell
      title={
        initialMode === "review" && reviewAvailable
          ? `Write a review of ${reviewTargetName ?? ""}`
          : "Compose"
      }
      onClose={onClose ?? noop}
    >
      <ModalCore
        initialMode={initialMode}
        reviewTargetId={reviewAvailable ? reviewTargetId : undefined}
        reviewTargetName={reviewAvailable ? reviewTargetName : undefined}
        reviewAvailable={reviewAvailable}
        onSubmitSuccess={onClose}
      />
    </ModalShell>
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

// Sprint 2 — civic prompts that cycle in the collapsed composer. Slow
// 18s cadence; halts on hover/focus so the operator never has to read
// a moving prompt. Reduced-motion users see the first prompt only.
const COMPOSER_PROMPTS: ReadonlyArray<string> = [
  "What's on your mind?",
  "Share something with the floor.",
  "Post an observation.",
];

function InlineStatusComposer({
  viewerAvatarUrl,
  viewerHandle,
  viewerDisplayName,
  groupId,
  groupScopeLabel,
}: InlineStatusComposerProps) {
  const [expanded, setExpanded] = useState(false);
  // Sprint 2 — civic prompt rotation in the collapsed composer.
  // 18s cadence; halts on hover/focus (promptPaused). Group composer
  // pins the scope-pinned placeholder so this index is ignored there.
  const [promptIndex, setPromptIndex] = useState(0);
  const [promptPaused, setPromptPaused] = useState(false);
  useEffect(() => {
    if (expanded || promptPaused || groupId !== undefined) return undefined;
    const id = window.setInterval(() => {
      setPromptIndex((i) => (i + 1) % COMPOSER_PROMPTS.length);
    }, 18_000);
    return () => window.clearInterval(id);
  }, [expanded, promptPaused, groupId]);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  // v1.5 photo state. `attachedFile` holds the selected File; `previewUrl`
  // is a transient `URL.createObjectURL()` for the thumbnail tile,
  // revoked on remove or unmount. Treat the pair as one logical state —
  // they're set + cleared together.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // v1.5 a11y (§3.3.9): per-photo alt text. Cleared together with the
  // photo state. Submitted via §4.18 PATCH /photos/:pho_id/alt right
  // after the photo upload returns its `photo_id` — the photo post
  // itself does not carry alt as a multipart field (see §4.14 spec).
  const [altText, setAltText] = useState("");
  // v1.5 GIF state. Single-attachment-per-post invariant: selecting a
  // GIF clears any attached file, and selecting a file clears the
  // GIF. The picker open/closed state is local; the picker only
  // mounts when the integration config says enabled.
  const [selectedGif, setSelectedGif] = useState<GiphySearchResult | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  // §3.3.12 mention-picker state.
  // `caretPos` mirrors the textarea's selectionEnd; updated on input
  // and selection-change events. Drives mention-trigger detection
  // (which is purely a function of (content, caretPos, ranges)).
  const [caretPos, setCaretPos] = useState<number>(0);
  // Active-option DOM id reported back from MentionPopover, mirrored
  // as `aria-activedescendant` on the textarea so screen-reader users
  // hear the focused row announced as they arrow through suggestions.
  const [mentionActiveOptionId, setMentionActiveOptionId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Giphy integration — fetched once per session, cached. Drives the
  // GIF button visibility (admin disabled → button hidden entirely
  // per the §4.16 contract).
  const giphyConfig = useGiphyIntegration({ enabled: expanded });
  const giphyEnabled = giphyConfig.data?.enabled === true;

  const clearAttachment = () => {
    setAttachedFile(null);
    setPreviewUrl((current) => {
      if (current !== null) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setAltText("");
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  };

  const clearGif = () => {
    setSelectedGif(null);
    setGifPickerOpen(false);
  };

  const clearAllAttachments = () => {
    clearAttachment();
    clearGif();
  };

  const statusMutation = useCreatePostMutation({
    onSuccess: () => {
      setContent("");
      setError(null);
      setExpanded(false);
    },
    onError: (err) => setError(humanizeError(err)),
  });

  // §3.3.9 / §4.18 alt-text writer. Fired after the photo upload
  // returns its `photo_id`. Fire-and-forget by design — if the alt
  // POST fails we surface a non-blocking inline note but the post
  // itself stays published. The user can re-set alt later via the
  // same endpoint (Phase 2 surface; not built yet).
  const photoAltMutation = useSetPhotoAltMutation({
    onError: () => {
      setError(
        "Photo posted, but we couldn't save your alt text. You can edit the photo to try again."
      );
    },
  });

  const photoMutation = useCreatePhotoPostMutation({
    onSuccess: (response) => {
      const cleanedAlt = altText.trim();
      if (cleanedAlt !== "") {
        photoAltMutation.mutate({ pho_id: response.photo_id, alt: cleanedAlt });
      }
      setContent("");
      clearAttachment();
      setError(null);
      setExpanded(false);
    },
    onError: (err) => setError(humanizeError(err)),
  });

  const gifMutation = useCreateGifPostMutation({
    onSuccess: () => {
      setContent("");
      clearGif();
      setError(null);
      setExpanded(false);
    },
    onError: (err) => setError(humanizeError(err)),
  });

  const isPending =
    statusMutation.isPending || photoMutation.isPending || gifMutation.isPending;
  const trimmed = content.trim();
  const length  = content.length;
  const overCap = length > STATUS_POST_MAX_LENGTH;

  // §3.3.12 — derived mention state.
  //
  // `mentionRanges` are the [start, end) offsets of every wire-format
  // token already inserted into the textarea. Recomputed from `content`
  // every render (via useMemo) so we never have to manually shift them
  // on edits. Used for atomic-token Backspace/Delete and for the
  // pre-submit count cap.
  //
  // `mentionTrigger` is "are we currently typing an @-prefix that
  // should open the picker?" — derived from (content, caretPos,
  // mentionRanges). Active when the caret is just after `@<word-chars>`
  // and `@` is at start-of-string OR preceded by whitespace/punctuation.
  // Skipping the trigger when caret is INSIDE an existing token range
  // prevents the picker from re-opening on the literal "@" inside
  // `@peepso_user_42(name)`.
  const mentionRanges  = useMemo(() => findMentionRanges(content), [content]);
  const mentionTrigger = useMemo(
    () => detectMentionTrigger(content, caretPos, mentionRanges),
    [content, caretPos, mentionRanges]
  );
  const mentionPickerOpen = expanded && mentionTrigger.active && !isPending;
  const overMentionCap    = mentionRanges.length > MENTIONS_PER_POST_MAX;
  // v1.5: photo-only / GIF-only posts are valid. `canSubmit` requires
  // SOMETHING — text OR photo OR GIF. Keeps casual posting frictionless
  // ("post this meme" doesn't need a caption).
  // §3.3.12 — pre-flight mention cap. Server still enforces; client
  // gate skips the round-trip + lets the cap message render inline.
  const canSubmit =
    (trimmed !== "" || attachedFile !== null || selectedGif !== null) &&
    !overCap &&
    !overMentionCap &&
    !isPending;

  // Click-outside-collapse — only when text AND both attachment slots
  // are empty, so a stray tap can't erase a draft OR a selected
  // photo OR a selected GIF. Same idiom GlobalSearch uses.
  useEffect(() => {
    if (!expanded) return undefined;
    const isEmpty = () =>
      content.trim() === "" && attachedFile === null && selectedGif === null;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (containerRef.current === null) return;
      if (!(event.target instanceof Node)) return;
      if (containerRef.current.contains(event.target)) return;
      if (isEmpty()) {
        setExpanded(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && isEmpty()) {
        setExpanded(false);
        textareaRef.current?.blur();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, content, attachedFile, selectedGif]);

  // Autofocus textarea on expand. The state-driven render means the
  // textarea remounts each time, so the ref is fresh when this fires.
  useEffect(() => {
    if (expanded) {
      textareaRef.current?.focus();
    }
  }, [expanded]);

  // Drives the expand-in CSS transition. The form mounts with
  // `max-h-0 opacity-0` and flips to `max-h-[400px] opacity-100`
  // on the next paint, easing the surface open instead of swapping.
  // Reduced-motion users skip the transition entirely (motion-safe:
  // variants below + the global prefers-reduced-motion override at
  // globals.css:115).
  const [animatedOpen, setAnimatedOpen] = useState(false);
  useEffect(() => {
    if (!expanded) {
      setAnimatedOpen(false);
      return undefined;
    }
    // Defer the open class one frame so the browser registers the
    // initial collapsed state before transitioning to the open state.
    const raf = window.requestAnimationFrame(() => {
      setAnimatedOpen(true);
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [expanded]);

  // Cleanup any pending blob URL on unmount so the browser doesn't
  // leak object URLs for a composer that disappeared mid-flight.
  useEffect(() => {
    return () => {
      if (previewUrl !== null) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file === null) {
      return;
    }
    if (!PHOTO_ALLOWED_MIME_TYPES.includes(file.type)) {
      setError("Photo must be JPEG, PNG, WebP, or GIF.");
      // Reset the input so re-picking the same bad file still triggers
      // a change event next time.
      if (fileInputRef.current !== null) fileInputRef.current.value = "";
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError("Photo is too large. 5 MB max.");
      if (fileInputRef.current !== null) fileInputRef.current.value = "";
      return;
    }

    // Single-attachment-per-post invariant: picking a photo silently
    // replaces any selected GIF (and vice versa in handleGifSelect).
    clearGif();

    // Replace any prior attachment + revoke its preview URL.
    setError(null);
    setPreviewUrl((current) => {
      if (current !== null) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setAttachedFile(file);
  };

  const handleGifSelect = (gif: GiphySearchResult) => {
    // Single-attachment-per-post invariant: picking a GIF silently
    // replaces any attached photo. Mirror of handleFileSelect.
    clearAttachment();
    setError(null);
    setSelectedGif(gif);
    setGifPickerOpen(false);
    // Return focus to the textarea so the user can immediately type
    // a caption (or skip and post). Matches the "selection instantly
    // returns focus to composition" UX call.
    textareaRef.current?.focus();
  };

  // §3.3.12 — handle a candidate selection from the mention popover.
  //
  // Splices the wire-format token at `mentionTrigger.anchor`,
  // replacing the partial `@<prefix>` the user had typed. Appends a
  // single space after the token so the caret lands ready for the
  // next word. Caret position is restored via setSelectionRange in a
  // microtask so React's controlled-textarea re-render lands first.
  const handleMentionSelect = (c: MentionSearchCandidate) => {
    if (!mentionTrigger.active) return;
    if (mentionRanges.length >= MENTIONS_PER_POST_MAX) {
      // Pre-flight cap. Server enforces too, but blocking client-side
      // saves the round-trip + gives a clearer error.
      setError(
        `Up to ${MENTIONS_PER_POST_MAX} mentions per post — remove one before adding another.`
      );
      return;
    }
    const before = content.substring(0, mentionTrigger.anchor);
    const after  = content.substring(caretPos);
    const token  = buildMentionToken(c.user_id, c.display_name);
    const insert = `${token} `;
    const next   = before + insert + after;
    const nextCaret = before.length + insert.length;

    setError(null);
    setContent(next);

    // Defer caret restore to after React commits the new value;
    // setSelectionRange against the textarea pre-commit would land
    // inside the OLD value. The rAF tick is enough to win the race
    // without touching React internals.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el === null) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      setCaretPos(nextCaret);
    });
  };

  // Keep `caretPos` in sync with the textarea so mention-trigger
  // detection stays accurate. Three event paths cover the cases:
  //   - typing → onChange (handled inline below)
  //   - arrow keys / mouse drag-to-position → onSelect
  //   - blur/refocus → next onSelect on focus
  const syncCaretFromEvent = (
    e: React.SyntheticEvent<HTMLTextAreaElement>
  ): void => {
    const el = e.currentTarget;
    setCaretPos(el.selectionEnd);
  };

  // Atomic-token Backspace / Delete — when the caret sits inside a
  // tracked mention range, both Backspace and Delete remove the
  // ENTIRE token in one stroke (Twitter/X-style). This avoids the
  // "halfway through (name) → wire token broken → notification
  // doesn't fire" footgun on token-in-textarea designs.
  const handleTextareaKeyDown = (
    e: ReactKeyboardEvent<HTMLTextAreaElement>
  ): void => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    const el = e.currentTarget;
    // Selection delete (drag-select then Backspace) — let the
    // browser do its native thing.
    if (el.selectionStart !== el.selectionEnd) return;

    const pos = el.selectionStart;
    for (const [start, end] of mentionRanges) {
      const insideForBackspace =
        e.key === "Backspace" && pos > start && pos <= end;
      const insideForDelete =
        e.key === "Delete" && pos >= start && pos < end;
      if (!insideForBackspace && !insideForDelete) continue;

      e.preventDefault();
      const next = content.substring(0, start) + content.substring(end);
      setContent(next);
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (t === null) return;
        t.focus();
        t.setSelectionRange(start, start);
        setCaretPos(start);
      });
      return;
    }
  };

  const closeMentionPicker = (): void => {
    // Blur the trigger by stepping caret one past the `@` so the
    // detector goes inactive. Easiest: temporarily move caret to
    // start of line… but that's user-hostile. Cleanest: just
    // synthesize a "no active prefix" state via an empty content
    // change at the same caret. Practically, Esc just blurs the
    // popover — the picker mounts on `mentionPickerOpen` which is
    // derived from the trigger, so we can't force-close without
    // either moving caret or stripping the `@`. For V1d: leave
    // dismissal to caret-movement / typing past the prefix.
    // No-op preserves the textarea state; the popover hides on the
    // next caret/content tick when the trigger evaluates false.
    // (Hooked up so MentionPopover.onClose has somewhere to land.)
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    // §4.7.6 — when this composer is mounted on a group page, every
    // submit carries `group_id` so the post lands inside that group's
    // wall. The mutation hooks invalidate the per-group feed query
    // (in addition to the global feed roots) so the new post surfaces
    // on /groups/[slug] without a manual refetch. `group_id` is
    // omitted from the payload entirely when undefined to keep the
    // wire body identical to today for non-group submits.
    if (selectedGif !== null) {
      gifMutation.mutate({
        url: selectedGif.url,
        caption: trimmed,
        ...(groupId !== undefined ? { group_id: groupId } : {}),
      });
    } else if (attachedFile !== null) {
      photoMutation.mutate({
        file: attachedFile,
        caption: trimmed,
        ...(groupId !== undefined ? { group_id: groupId } : {}),
      });
    } else {
      statusMutation.mutate({
        content: trimmed,
        ...(groupId !== undefined ? { group_id: groupId } : {}),
      });
    }
  };

  const dismiss = () => {
    setContent("");
    clearAllAttachments();
    setError(null);
    setExpanded(false);
  };

  const hasPhoto = attachedFile !== null;
  const hasGif   = selectedGif !== null;
  const hasAttachment = hasPhoto || hasGif;
  const placeholder = hasAttachment
    ? "Add a caption (optional)…"
    : "Say what's on your mind…";

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
            <div className="flex flex-col gap-2">
              <div className="relative inline-flex w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt=""
                  className="h-24 w-24 rounded-sm border border-cardstock-edge/40 object-cover"
                />
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label="Remove photo"
                  className="bcc-mono absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cardstock-edge/60 bg-ink text-[10px] leading-none text-cardstock hover:bg-safety hover:text-cardstock"
                  title="Remove photo"
                >
                  ×
                </button>
              </div>
              {/*
                §3.3.9 / §4.18 alt-text input — author-supplied screen-reader
                description for the photo. Optional; chained POST after the
                photo upload via useSetPhotoAltMutation. Server applies the
                same 500-char cap and HTML stripping.
              */}
              <label className="bcc-mono flex flex-col gap-1 text-[11px] text-cardstock/70">
                <span>
                  Describe this photo{" "}
                  <span className="text-cardstock/40">(optional, helps screen readers)</span>
                </span>
                <textarea
                  id="composer-photo-alt"
                  aria-describedby="composer-photo-alt-counter"
                  value={altText}
                  onChange={(event) => setAltText(event.target.value)}
                  maxLength={PHOTO_ALT_MAX_LENGTH}
                  rows={2}
                  disabled={isPending}
                  className="font-serif resize-y rounded-sm border border-cardstock-edge/40 bg-cardstock/5 px-2 py-1 text-[13px] leading-snug text-ink placeholder:text-ink/40 focus-visible:border-cardstock-edge focus-visible:outline-none disabled:opacity-50"
                  placeholder="e.g. Phillip standing under the BCC banner holding the demo board."
                />
                {/*
                  Live region is unconditionally mounted so AT engines
                  hook up at component mount; the visible-state toggle
                  rides on `hidden` (not conditional render) so the
                  threshold-cross is reliably announced.
                */}
                <span
                  id="composer-photo-alt-counter"
                  aria-live="polite"
                  hidden={altText.length < PHOTO_ALT_MAX_LENGTH - 50}
                  className={
                    altText.length > PHOTO_ALT_MAX_LENGTH
                      ? "text-safety"
                      : "text-cardstock/50"
                  }
                >
                  {altText.length}/{PHOTO_ALT_MAX_LENGTH}
                </span>
              </label>
            </div>
          )}

          {hasGif && selectedGif !== null && (
            <div className="relative inline-flex w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedGif.preview_url}
                alt=""
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
// Modal shell — local idiom shared with OpenDisputeModal until the
// design system grows a real <Dialog>. ESC + backdrop click both close.
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

/**
 * Map BCC API error codes to user-readable strings for the composer
 * surface. Exported so the blog tab's CREATE sub-tab (which mounts
 * BlogForm directly, outside the Composer shell) shares the same
 * humanization.
 */
export function humanizeError(err: unknown): string {
  // `bcc_too_many_mentions` carries a structured `data.max` we want to
  // surface in the copy, so it needs its own branch before falling into
  // the helper's static copy map.
  if (err instanceof BccApiError && err.code === "bcc_too_many_mentions") {
    const maxRaw = err.data?.["max"];
    const max = typeof maxRaw === "number" ? maxRaw : null;
    return max !== null
      ? `Too many mentions — please mention up to ${max} people per post.`
      : "Too many mentions in this post. Trim some and try again.";
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to post.",
      bcc_forbidden:
        "You haven't unlocked this yet — keep watching cards and writing on the Floor.",
      bcc_invalid_request: "That post can't be sent — check the content.",
      // Per §3.3.12 — the server intentionally hides which user failed
      // which check (privacy posture). The `user_id` in `data` is for
      // telemetry only and is never user-visible.
      bcc_invalid_mention_target:
        "Couldn't mention that user. Try removing the mention and posting again.",
      bcc_rate_limited: "Slow down — wait a moment before posting again.",
      bcc_unavailable: "Posts are temporarily unavailable. Try again shortly.",
    },
    "Couldn't send your post. Try again.",
  );
}

function noop(): void {
  /* placeholder when modal variant is mounted without an onClose */
}

// ─────────────────────────────────────────────────────────────────────
// §3.3.12 — mention helpers (Phase 1d)
// ─────────────────────────────────────────────────────────────────────

/**
 * Wire-format token regex. Mirrors PeepSo's parser
 * (peepso/classes/tags.php#L77) so what we extract here matches
 * what the server's MentionExtractor / Tags::after_save_post
 * extract on write.
 *
 * The capture group is intentional but unused in this client; we
 * only need the match boundaries.
 */
/**
 * DOM id for the mention listbox. Constant rather than `useId` so
 * the textarea's `aria-controls` and the listbox's `id` stay
 * lockstep without the parent threading the generated id through
 * yet another prop. Single composer per page in V1d (the inline
 * Floor composer mounts once); when a future surface mounts two
 * composers concurrently, switch to a useId-derived id.
 */
const MENTION_LISTBOX_ID = "composer-mention-listbox";

const MENTION_TOKEN_RE = /@peepso_user_[a-z]*\d+\([^)]+\)/gi;

/**
 * Walk the textarea value and emit `[start, end)` offsets of every
 * wire-format token. Derived state — recomputed on every change so we
 * never have to manually shift ranges through edits.
 */
function findMentionRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (text === "") return out;
  // Reset lastIndex on the global flag so re-runs start clean.
  MENTION_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN_RE.exec(text)) !== null) {
    out.push([match.index, match.index + match[0].length]);
    if (match[0].length === 0) {
      // Defensive — exec on a zero-width match would loop forever.
      MENTION_TOKEN_RE.lastIndex += 1;
    }
  }
  return out;
}

/**
 * Detect whether the caret is currently positioned at an active
 * mention trigger — i.e. "@<prefix>" where:
 *   - `@` is at start-of-text OR preceded by whitespace / punctuation
 *     (rejects email-like patterns: `foo@bar` should NOT trigger)
 *   - the prefix between `@` and caret contains no whitespace
 *   - the caret is NOT inside an already-tracked wire token range
 *     (prevents the picker from re-opening on the literal `@` inside
 *     `@peepso_user_42(name)`)
 *
 * Returns the prefix + its anchor offset on hit; otherwise inactive.
 */
type MentionTrigger =
  | { active: false }
  | { active: true; query: string; anchor: number };

const TRIGGER_BREAK_RE = /[\s.,;:!?(){}\[\]<>'"]/;

function detectMentionTrigger(
  text: string,
  caretPos: number,
  ranges: ReadonlyArray<readonly [number, number]>
): MentionTrigger {
  if (caretPos < 1 || caretPos > text.length) return { active: false };

  // Caret inside a tracked token? Atomic-delete owns this case;
  // the picker stays closed.
  for (const [start, end] of ranges) {
    if (caretPos > start && caretPos < end) return { active: false };
  }

  // Walk back from caret looking for the `@`. Bail on whitespace
  // (mention prefix can't contain whitespace).
  let i = caretPos - 1;
  while (i >= 0) {
    const ch = text.charAt(i);
    if (ch === "@") {
      // `@` must be at start-of-text or preceded by a break char.
      if (i === 0) {
        return {
          active: true,
          query: text.substring(i + 1, caretPos),
          anchor: i,
        };
      }
      const prev = text.charAt(i - 1);
      if (TRIGGER_BREAK_RE.test(prev)) {
        return {
          active: true,
          query: text.substring(i + 1, caretPos),
          anchor: i,
        };
      }
      return { active: false };
    }
    if (TRIGGER_BREAK_RE.test(ch)) return { active: false };
    i--;
  }
  return { active: false };
}
