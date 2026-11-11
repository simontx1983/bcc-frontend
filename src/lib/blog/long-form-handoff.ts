/**
 * long-form-handoff — carries an over-limit status post into the blog
 * composer.
 *
 * Two viewer-scoped localStorage records, both written BEFORE the
 * composer navigates so BlogComposer can never mount ahead of them:
 *
 *   - the post text goes into the blog body draft
 *     (`bcc.blog.draft::<viewer>`), REPLACING any existing draft. That is
 *     the key BlogComposer already autosaves to and restores from, so no
 *     second body channel exists;
 *   - the cover and the notice go into a one-shot handoff record
 *     (`bcc.blog.handoff::<viewer>`). BlogComposer reads it once, applies
 *     it, and deletes it. The family is registered in
 *     VIEWER_SCOPED_STORAGE_KEYS so sign-out clears it.
 *
 * Every storage access is wrapped: localStorage throws outright in some
 * private modes and when site data is blocked.
 */

import type { BlogCoverImageUploadResponse } from "@/lib/api/types";
import { scopedKey, type ViewerScope } from "@/lib/auth/viewer-scope";

/** Scoped per viewer at runtime: `bcc.blog.draft::<viewer id>`. */
export const BLOG_DRAFT_KEY_BASE = "bcc.blog.draft";

/** Scoped per viewer at runtime: `bcc.blog.handoff::<viewer id>`. */
export const LONG_FORM_HANDOFF_KEY_BASE = "bcc.blog.handoff";

/**
 * What happened to the post's attachment.
 *   - `none`         nothing was attached, or the photo became the cover
 *   - `photo_failed` the photo upload failed; no cover was set
 *   - `gif_dropped`  a GIF was attached; GIFs can't become a cover
 */
export type LongFormHandoffNotice = "none" | "photo_failed" | "gif_dropped";

export interface LongFormHandoff {
  cover: BlogCoverImageUploadResponse | null;
  notice: LongFormHandoffNotice;
}

/**
 * Write the body draft and the handoff record for `scope`.
 *
 * @returns `false` when the scope is unknown or storage threw — the
 *          caller must not clear the post or navigate, because nothing
 *          was carried.
 */
export function writeLongFormHandoff(
  scope: ViewerScope,
  body: string,
  handoff: LongFormHandoff,
): boolean {
  const draftKey = scopedKey(BLOG_DRAFT_KEY_BASE, scope);
  const handoffKey = scopedKey(LONG_FORM_HANDOFF_KEY_BASE, scope);
  if (draftKey === null || handoffKey === null) return false;
  try {
    window.localStorage.setItem(draftKey, body);
    window.localStorage.setItem(handoffKey, JSON.stringify(handoff));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and delete the handoff record for `scope`. One-shot: a second call
 * returns `null`. A malformed record is deleted and ignored.
 */
export function consumeLongFormHandoff(scope: ViewerScope): LongFormHandoff | null {
  const key = scopedKey(LONG_FORM_HANDOFF_KEY_BASE, scope);
  if (key === null) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    window.localStorage.removeItem(key);
  } catch {
    return null;
  }
  try {
    return parseHandoff(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseHandoff(value: unknown): LongFormHandoff | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const notice = record["notice"];
  if (notice !== "none" && notice !== "photo_failed" && notice !== "gif_dropped") {
    return null;
  }
  return { cover: parseCover(record["cover"]), notice };
}

function parseCover(value: unknown): BlogCoverImageUploadResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  const { attachment_id, url, width, height } = {
    attachment_id: c["attachment_id"],
    url: c["url"],
    width: c["width"],
    height: c["height"],
  };
  if (
    typeof attachment_id !== "number" ||
    attachment_id <= 0 ||
    typeof url !== "string" ||
    url === "" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  return { attachment_id, url, width, height };
}
