/**
 * Typed wrappers for the claimer-owned page-image routes.
 *
 * Backend: PageAvatarEndpoint @ /wp-json/bcc/v1. Standard BCC envelope
 * (success body under the envelope; errors `{error:{code,message,status}}`).
 * Auth required — bearer JWT — and the caller must be the verified
 * claimer of the validator/project/creator page (server enforces the
 * `can_edit_image` gate).
 *
 * Two operations, mirroring the member-avatar pair in
 * profile-endpoints.ts but keyed by page id instead of the implicit
 * "me":
 *   - uploadPageAvatar  → POST   /pages/{id}/avatar (multipart, field `avatar`)
 *   - deletePageAvatar  → DELETE /pages/{id}/avatar
 *
 * The uploaded image is stored as the page's WP featured image, which
 * the crest resolver ranks above the auto-imported logo. The response
 * only carries the new `image_url`; the caller refetches the card
 * view-model to pick up the recomputed crest.
 */

import { bccFetchAsClient } from "@/lib/api/client";

export interface PageAvatarResult {
  page_id: number;
  image_url: string | null;
}

export function uploadPageAvatar(
  pageId: number,
  file: File,
): Promise<PageAvatarResult> {
  const fd = new FormData();
  fd.append("avatar", file, file.name);
  return bccFetchAsClient<PageAvatarResult>(`pages/${pageId}/avatar`, {
    method: "POST",
    body: fd,
  });
}

export function deletePageAvatar(pageId: number): Promise<PageAvatarResult> {
  return bccFetchAsClient<PageAvatarResult>(`pages/${pageId}/avatar`, {
    method: "DELETE",
  });
}
