"use client";

/**
 * LongFormOffer — the over-limit status post → blog draft handoff.
 *
 * Renders only once the post passes STATUS_POST_MAX_LENGTH, under the
 * character counter of both status composers (the inline Floor composer
 * and the modal StatusForm). On click it:
 *
 *   1. uploads the first attached photo as a blog cover
 *      (`uploadBlogCoverImage`); a failed upload still moves the text,
 *      and a GIF never moves — the blog editor says which;
 *   2. writes the body draft + one-shot handoff record
 *      (`lib/blog/long-form-handoff`) BEFORE navigating, so the blog
 *      composer's restore can't run ahead of them;
 *   3. clears the short-post draft and pushes the author's blog tab in
 *      create mode. An existing blog draft is replaced without a prompt.
 */

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useViewerScope } from "@/hooks/useViewerScope";
import { uploadBlogCoverImage } from "@/lib/api/blog-endpoints";
import {
  STATUS_POST_MAX_LENGTH,
  type BlogCoverImageUploadResponse,
} from "@/lib/api/types";
import { ANON_SCOPE } from "@/lib/auth/viewer-scope";
import { blogUrl } from "@/lib/blog/blog-url";
import {
  writeLongFormHandoff,
  type LongFormHandoffNotice,
} from "@/lib/blog/long-form-handoff";

/**
 * Whether a composer may offer the blog handoff at all. Blogs can't
 * target a group yet, so a group-scoped composer never offers it; when
 * group blogs land, this is the one place to change.
 */
function isLongFormHandoffAvailable(groupId: number | undefined): boolean {
  return groupId === undefined;
}

export interface LongFormOfferProps {
  /** Current post length in characters. */
  length: number;
  /** The composer's group scope, if any — see isLongFormHandoffAvailable. */
  groupId?: number | undefined;
  /** The post text as plain prose (mentions rendered as `@handle`). */
  getText: () => string;
  /** The first attached photo, if any. Becomes the blog cover. */
  photo?: File | null | undefined;
  /** A GIF is attached. GIFs can't become a cover. */
  hasGif?: boolean | undefined;
  /** A composer write is in flight. */
  disabled?: boolean | undefined;
  /** Server-resolved viewer handle, when the host has one. */
  viewerHandle?: string | undefined;
  /** Clears the short-post draft (text, photo, GIF, alt text). */
  onMoved: () => void;
}

export function LongFormOffer({
  length,
  groupId,
  getText,
  photo = null,
  hasGif = false,
  disabled = false,
  viewerHandle,
  onMoved,
}: LongFormOfferProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const scope = useViewerScope();
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State updates land a render late; the ref stops a fast double-click
  // starting a second upload before `moving` disables the button.
  const movingRef = useRef(false);
  const labelId = useId();

  if (length <= STATUS_POST_MAX_LENGTH || !isLongFormHandoffAvailable(groupId)) {
    return null;
  }

  const handle =
    viewerHandle !== undefined && viewerHandle !== ""
      ? viewerHandle
      : (session?.user?.handle ?? "");
  const ready = scope !== null && scope !== ANON_SCOPE && handle !== "";
  const isDisabled = disabled || moving || !ready;

  const move = async (): Promise<void> => {
    if (movingRef.current || !ready) return;
    movingRef.current = true;
    setMoving(true);
    setError(null);

    let cover: BlogCoverImageUploadResponse | null = null;
    let notice: LongFormHandoffNotice = "none";
    if (photo !== null) {
      try {
        cover = await uploadBlogCoverImage(photo);
      } catch {
        notice = "photo_failed";
      }
    } else if (hasGif) {
      notice = "gif_dropped";
    }

    if (!writeLongFormHandoff(scope, getText(), { cover, notice })) {
      setError("Couldn't move this post. Your text is still here.");
      movingRef.current = false;
      setMoving(false);
      return;
    }

    onMoved();
    router.push(blogUrl(handle, { create: true }));
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="bcc-mono flex flex-wrap items-center gap-x-2 text-[11px] text-bcc-text-secondary">
        <span id={labelId}>Too long for a post.</span>
        <button
          type="button"
          onClick={() => {
            void move();
          }}
          disabled={isDisabled}
          aria-describedby={labelId}
          aria-busy={moving}
          title={ready ? undefined : "Available once your session has loaded."}
          // --bcc-text with a persistent underline, the house link style
          // since #74: accent as small text reads 2.39:1 in light.
          className="bcc-mono inline-flex min-h-[44px] items-center text-[11px] text-bcc-text underline underline-offset-2 hover:no-underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {moving ? (
            "Moving to a blog post…"
          ) : (
            <>
              Turn it into a blog post<span aria-hidden="true">&nbsp;→</span>
            </>
          )}
        </button>
      </p>
      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
          {error}
        </p>
      )}
    </div>
  );
}
