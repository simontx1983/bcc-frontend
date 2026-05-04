/**
 * §V2 Phase 2 — typed wrappers for /me/profile.
 *
 * Backend: MyProfileEndpoint @ /wp-json/bcc/v1. Standard BCC envelope
 * (`{data, _meta}`). Auth required — bearer JWT.
 *
 * Five operations:
 *   - patchProfile        → PATCH /me/profile (bio text)
 *   - uploadAvatar        → POST /me/profile/avatar (multipart)
 *   - deleteAvatar        → DELETE /me/profile/avatar
 *   - uploadCover         → POST /me/profile/cover (multipart)
 *   - deleteCover         → DELETE /me/profile/cover
 *
 * Every route returns the full updated MemberProfile so the caller can
 * replace its local cache without a refetch.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { MemberProfile } from "@/lib/api/types";

export interface PatchProfileBody {
  bio?: string;
}

export function patchProfile(body: PatchProfileBody): Promise<MemberProfile> {
  return bccFetchAsClient<MemberProfile>("me/profile", {
    method: "PATCH",
    body,
  });
}

export function uploadAvatar(file: File): Promise<MemberProfile> {
  const fd = new FormData();
  fd.append("avatar", file, file.name);
  return bccFetchAsClient<MemberProfile>("me/profile/avatar", {
    method: "POST",
    body: fd,
  });
}

export function deleteAvatar(): Promise<MemberProfile> {
  return bccFetchAsClient<MemberProfile>("me/profile/avatar", {
    method: "DELETE",
  });
}

export function uploadCover(file: File): Promise<MemberProfile> {
  const fd = new FormData();
  fd.append("cover", file, file.name);
  return bccFetchAsClient<MemberProfile>("me/profile/cover", {
    method: "POST",
    body: fd,
  });
}

export function deleteCover(): Promise<MemberProfile> {
  return bccFetchAsClient<MemberProfile>("me/profile/cover", {
    method: "DELETE",
  });
}

export interface CoverPosition {
  x: number;
  y: number;
}

export function patchCoverPosition(position: CoverPosition): Promise<MemberProfile> {
  return bccFetchAsClient<MemberProfile>("me/profile/cover/position", {
    method: "PATCH",
    body: position,
  });
}
