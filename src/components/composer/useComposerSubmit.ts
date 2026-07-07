"use client";

/**
 * useInlineComposerSubmit — the inline composer's mutation
 * orchestration: the status / photo / GIF submit pipelines, the
 * chained §4.18 alt-text write, and the shared error humanization.
 * Extracted from Composer.tsx (Phase 3.3 god-component split);
 * logic unchanged. State stays in useComposerState — this module
 * only owns "send it and recover from failure."
 */

import {
  useCreateGifPostMutation,
  useCreatePhotoPostMutation,
  useCreatePostMutation,
} from "@/hooks/useCreatePost";
import { useSetPhotoAltMutation } from "@/hooks/useSetPhotoAlt";
import { humanizeCode } from "@/lib/api/errors";
import {
  BccApiError,
  type GiphySearchResult,
  type GroupPostVisibility,
} from "@/lib/api/types";

interface UseInlineComposerSubmitArgs {
  /**
   * §4.7.6 — when present, every submit (status / photo / GIF) carries
   * `group_id` so the post lands inside that group's wall. Membership
   * is enforced server-side.
   */
  groupId: number | undefined;
  /** §4.7.6 group-post visibility — only sent when groupId is present. */
  visibility: GroupPostVisibility;
  /**
   * §3.3.9 alt text — read at photo-success time so the chained §4.18
   * PATCH carries whatever the author had typed when the upload landed.
   */
  altText: string;
  onStatusSuccess: () => void;
  onPhotoSuccess: () => void;
  onGifSuccess: () => void;
  onError: (message: string) => void;
}

export interface InlineComposerSubmitPayload {
  trimmed: string;
  attachedFile: File | null;
  selectedGif: GiphySearchResult | null;
}

export function useInlineComposerSubmit({
  groupId,
  visibility,
  altText,
  onStatusSuccess,
  onPhotoSuccess,
  onGifSuccess,
  onError,
}: UseInlineComposerSubmitArgs) {
  const statusMutation = useCreatePostMutation({
    onSuccess: onStatusSuccess,
    onError: (err) => onError(humanizeError(err)),
  });

  // §3.3.9 / §4.18 alt-text writer. Fired after the photo upload
  // returns its `photo_id`. Fire-and-forget by design — if the alt
  // POST fails we surface a non-blocking inline note but the post
  // itself stays published. The user can re-set alt later via the
  // same endpoint (Phase 2 surface; not built yet).
  const photoAltMutation = useSetPhotoAltMutation({
    onError: () => {
      onError(
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
      onPhotoSuccess();
    },
    onError: (err) => onError(humanizeError(err)),
  });

  const gifMutation = useCreateGifPostMutation({
    onSuccess: onGifSuccess,
    onError: (err) => onError(humanizeError(err)),
  });

  const isPending =
    statusMutation.isPending || photoMutation.isPending || gifMutation.isPending;

  // §4.7.6 — when this composer is mounted on a group page, every
  // submit carries `group_id` so the post lands inside that group's
  // wall. The mutation hooks invalidate the per-group feed query
  // (in addition to the global feed roots) so the new post surfaces
  // on /groups/[slug] without a manual refetch. `group_id` is
  // omitted from the payload entirely when undefined to keep the
  // wire body identical to today for non-group submits.
  const submit = ({
    trimmed,
    attachedFile,
    selectedGif,
  }: InlineComposerSubmitPayload): void => {
    if (selectedGif !== null) {
      gifMutation.mutate({
        url: selectedGif.url,
        caption: trimmed,
        ...(groupId !== undefined ? { group_id: groupId, visibility } : {}),
      });
    } else if (attachedFile !== null) {
      photoMutation.mutate({
        file: attachedFile,
        caption: trimmed,
        ...(groupId !== undefined ? { group_id: groupId, visibility } : {}),
      });
    } else {
      statusMutation.mutate({
        content: trimmed,
        ...(groupId !== undefined ? { group_id: groupId, visibility } : {}),
      });
    }
  };

  return { isPending, submit };
}

/**
 * Map BCC API error codes to user-readable strings for the composer
 * surface. Exported so sibling composer forms can share the same
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
        // cadence-pressure-guard:allow — unlock-requirement explanation on a denied action, not a schedule nudge
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
