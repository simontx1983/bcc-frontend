"use client";

/**
 * useComposerState — the inline composer's form state machine:
 * expand/collapse + prompt rotation, body content + validation,
 * photo / GIF attachment slots, §3.3.12 mention detection, and the
 * submit dispatch (delegated to useInlineComposerSubmit). Extracted
 * from Composer.tsx (Phase 3.3 god-component split); logic unchanged.
 * The JSX in Composer.tsx destructures this hook's return verbatim.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from "react";

import { useGiphyIntegration } from "@/hooks/useGiphyIntegration";
import {
  buildMentionToken,
  MENTIONS_PER_POST_MAX,
  PHOTO_ALLOWED_MIME_TYPES,
  PHOTO_MAX_BYTES,
  STATUS_POST_MAX_LENGTH,
  type GiphySearchResult,
  type GroupPostVisibility,
  type MentionSearchCandidate,
} from "@/lib/api/types";

import { useInlineComposerSubmit } from "./useComposerSubmit";

// Sprint 2 — civic prompts that cycle in the collapsed composer. Slow
// 18s cadence; halts on hover/focus so the operator never has to read
// a moving prompt. Reduced-motion users see the first prompt only.
export const COMPOSER_PROMPTS: ReadonlyArray<string> = [
  "What's on your mind?",
  "Share something with the floor.",
  "Post an observation.",
];

/**
 * DOM id for the mention listbox. Constant rather than `useId` so
 * the textarea's `aria-controls` and the listbox's `id` stay
 * lockstep without the parent threading the generated id through
 * yet another prop. Single composer per page in V1d (the inline
 * Floor composer mounts once); when a future surface mounts two
 * composers concurrently, switch to a useId-derived id.
 */
export const MENTION_LISTBOX_ID = "composer-mention-listbox";

interface UseComposerStateArgs {
  /**
   * §4.7.6 — when present, every submit (status / photo / GIF) carries
   * `group_id` so the post lands inside that group's wall. Membership
   * is enforced server-side; the parent (`GroupFeedSection`) is
   * responsible for not mounting this composer when the viewer isn't
   * a member.
   */
  groupId: number | undefined;
}

export function useComposerState({ groupId }: UseComposerStateArgs) {
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
  // §4.7.6 group-post visibility. Only surfaced (and only sent) when the
  // composer is group-scoped; defaults to members_only, matching the
  // server-side default when the field is omitted.
  const [visibility, setVisibility] =
    useState<GroupPostVisibility>("members_only");
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

  const { isPending, submit } = useInlineComposerSubmit({
    groupId,
    visibility,
    altText,
    onStatusSuccess: () => {
      setContent("");
      setVisibility("members_only");
      setError(null);
      setExpanded(false);
    },
    onPhotoSuccess: () => {
      setContent("");
      clearAttachment();
      setVisibility("members_only");
      setError(null);
      setExpanded(false);
    },
    onGifSuccess: () => {
      setContent("");
      clearGif();
      setVisibility("members_only");
      setError(null);
      setExpanded(false);
    },
    onError: setError,
  });

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

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
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
    e: SyntheticEvent<HTMLTextAreaElement>
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
    submit({ trimmed, attachedFile, selectedGif });
  };

  const dismiss = () => {
    setContent("");
    clearAllAttachments();
    setVisibility("members_only");
    setError(null);
    setExpanded(false);
  };

  const hasPhoto = attachedFile !== null;
  const hasGif   = selectedGif !== null;
  const hasAttachment = hasPhoto || hasGif;
  const placeholder = hasAttachment
    ? "Add a caption (optional)…"
    : "Say what's on your mind…";

  return {
    // expand/collapse + prompt rotation
    expanded,
    setExpanded,
    promptIndex,
    setPromptPaused,
    animatedOpen,
    // body + validation
    content,
    setContent,
    error,
    setError,
    trimmed,
    length,
    overCap,
    canSubmit,
    isPending,
    // §4.7.6 visibility
    visibility,
    setVisibility,
    // photo slot
    attachedFile,
    previewUrl,
    altText,
    setAltText,
    clearAttachment,
    handleFileSelect,
    // GIF slot
    selectedGif,
    gifPickerOpen,
    setGifPickerOpen,
    clearGif,
    handleGifSelect,
    giphyConfig,
    giphyEnabled,
    // §3.3.12 mentions
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
    // refs
    containerRef,
    textareaRef,
    fileInputRef,
    // submit + lifecycle
    handleSubmit,
    dismiss,
    // derived attachment flags
    hasPhoto,
    hasGif,
    hasAttachment,
    placeholder,
  };
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
