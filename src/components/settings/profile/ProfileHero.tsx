"use client";

/**
 * ProfileHero — combined cover banner + avatar overlay.
 *
 * Replaces the standalone "Avatar" and "Cover photo" cards from V2
 * Phase 2's ProfileSettingsForm. The avatar floats over the cover the
 * same way PeepSo's own profile renders it; on hover, each region
 * reveals a "Change photo" affordance.
 *
 * Cover crop position is editable inline via two range inputs that
 * appear when the user clicks "Reposition" — no separate panel. The
 * avatar and cover wire up to the existing /me/profile/{avatar,cover}
 * routes.
 *
 * Errors and last-saved confirmations bubble up to the host page via
 * a single bottom row.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  useDeleteAvatar,
  useDeleteCover,
  useUpdateCoverPosition,
  useUploadAvatar,
  useUploadCover,
} from "@/hooks/useUpdateProfile";
import { BccApiError, type MemberProfile } from "@/lib/api/types";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:    "We couldn't accept that. Check the file and try again.",
  bcc_unauthorized:       "Sign in required.",
  bcc_upload_failed:      "Upload failed. Try again or pick a different file.",
  bcc_peepso_unavailable: "Image storage isn't available right now. Try again later.",
  bcc_internal_error:     "Server error. Try again.",
};

function humanizeError(err: BccApiError | Error): string {
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? err.message;
  }
  return "Something went wrong. Try again.";
}

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ProfileHeroProps {
  profile: MemberProfile;
  /**
   * Optional tab strip rendered flush against the bottom edge of the
   * hero panel — used by SettingsLayout to put the global settings
   * navigation INSIDE the hero so that switching tabs keeps the cover
   * banner + avatar visible (Twitter / LinkedIn pattern).
   */
  nav?: React.ReactNode;
}

export function ProfileHero({ profile, nav }: ProfileHeroProps) {
  const router = useRouter();

  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [reposMode, setReposMode] = useState(false);
  const [posX, setPosX] = useState(profile.cover_photo_position.x);
  const [posY, setPosY] = useState(profile.cover_photo_position.y);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const onMutationSuccess = () => {
    setSavedAt(Date.now());
    setServerError(null);
    router.refresh();
  };
  const onMutationError = (err: BccApiError | Error) => {
    setSavedAt(null);
    setServerError(humanizeError(err));
  };

  const uploadCover = useUploadCover({ onSuccess: onMutationSuccess, onError: onMutationError });
  const removeCover = useDeleteCover({ onSuccess: onMutationSuccess, onError: onMutationError });
  const positionMutation = useUpdateCoverPosition({
    onSuccess: () => {
      onMutationSuccess();
      setReposMode(false);
    },
    onError: onMutationError,
  });
  const uploadAvatar = useUploadAvatar({ onSuccess: onMutationSuccess, onError: onMutationError });
  const removeAvatar = useDeleteAvatar({ onSuccess: onMutationSuccess, onError: onMutationError });

  const busy =
    uploadCover.isPending ||
    removeCover.isPending ||
    positionMutation.isPending ||
    uploadAvatar.isPending ||
    removeAvatar.isPending;

  const hasCover = profile.cover_photo_url !== null && profile.cover_photo_url !== "";
  const hasAvatar = profile.avatar_url !== "";
  const positionDirty =
    posX !== profile.cover_photo_position.x ||
    posY !== profile.cover_photo_position.y;

  function handleCoverChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setServerError(null);
    setSavedAt(null);
    if (file.size > COVER_MAX_BYTES) {
      setServerError(
        `Cover photo must be 5 MB or smaller (yours is ${humanFileSize(file.size)}).`,
      );
      event.target.value = "";
      return;
    }
    uploadCover.mutate(file);
    event.target.value = "";
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setServerError(null);
    setSavedAt(null);
    if (file.size > AVATAR_MAX_BYTES) {
      setServerError(
        `Avatar must be 2 MB or smaller (yours is ${humanFileSize(file.size)}).`,
      );
      event.target.value = "";
      return;
    }
    uploadAvatar.mutate(file);
    event.target.value = "";
  }

  return (
    <section className="bcc-panel overflow-hidden">
      {/* Cover banner */}
      <div
        className="group/cover relative h-40 w-full overflow-hidden bg-cardstock-deep md:h-56"
        style={{ aspectRatio: "3 / 1" }}
      >
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.cover_photo_url ?? ""}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: `${posX}% ${posY}%` }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cardstock-deep to-cardstock-edge">
            <span className="bcc-mono text-[10px] tracking-[0.2em] text-ink-soft">
              NO COVER PHOTO
            </span>
          </div>
        )}

        {/* Hover overlay — cover edit affordances */}
        <div className="absolute inset-0 flex items-end justify-end gap-2 bg-ink/0 p-3 opacity-0 transition-all group-hover/cover:bg-ink/35 group-hover/cover:opacity-100 focus-within:bg-ink/35 focus-within:opacity-100">
          <input
            ref={coverInputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            onChange={handleCoverChange}
            disabled={busy}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => coverInputRef.current?.click()}
            className="bcc-mono border border-cardstock bg-ink/80 px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock backdrop-blur transition hover:bg-ink disabled:opacity-50"
          >
            {uploadCover.isPending ? "UPLOADING…" : hasCover ? "CHANGE COVER" : "ADD COVER"}
          </button>
          {hasCover && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReposMode((v) => !v)}
                className="bcc-mono border border-cardstock bg-ink/80 px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock backdrop-blur transition hover:bg-ink disabled:opacity-50"
              >
                {reposMode ? "DONE" : "REPOSITION"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => removeCover.mutate()}
                className="bcc-mono border border-safety/70 bg-safety/80 px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock backdrop-blur transition hover:bg-safety disabled:opacity-50"
              >
                {removeCover.isPending ? "REMOVING…" : "REMOVE"}
              </button>
            </>
          )}
        </div>

        {/* Avatar overlay — sits half-over the cover, half-over the panel */}
        <div className="group/avatar absolute -bottom-12 left-6 md:left-8">
          <div className="relative h-24 w-24 overflow-hidden border-4 border-cardstock bg-cardstock-deep shadow-md md:h-28 md:w-28">
            {hasAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={`${profile.display_name}'s avatar`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-cardstock-deep">
                <span className="bcc-stencil text-3xl text-ink-soft">
                  {(profile.display_name[0] ?? "?").toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/0 opacity-0 transition-all group-hover/avatar:bg-ink/55 group-hover/avatar:opacity-100 focus-within:bg-ink/55 focus-within:opacity-100">
              <input
                ref={avatarInputRef}
                type="file"
                accept={ACCEPT_IMAGES}
                onChange={handleAvatarChange}
                disabled={busy}
                className="hidden"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => avatarInputRef.current?.click()}
                className="bcc-mono border border-cardstock bg-ink/85 px-2 py-1 text-[9px] tracking-[0.16em] text-cardstock backdrop-blur transition hover:bg-ink disabled:opacity-50"
              >
                {uploadAvatar.isPending ? "UPLOADING…" : "CHANGE"}
              </button>
              {hasAvatar && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeAvatar.mutate()}
                  className="bcc-mono border border-safety/70 bg-safety/85 px-2 py-1 text-[9px] tracking-[0.16em] text-cardstock backdrop-blur transition hover:bg-safety disabled:opacity-50"
                >
                  {removeAvatar.isPending ? "REMOVING…" : "REMOVE"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reposition controls — appear when REPOSITION clicked */}
      {hasCover && reposMode && (
        <div className="border-t border-cardstock-edge bg-cardstock-deep/30 px-6 py-4">
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
            CROP POSITION
          </span>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-3">
              <span className="bcc-mono w-20 text-[10px] text-ink-soft">
                Horizontal
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={posX}
                disabled={busy}
                onChange={(event) => setPosX(Number(event.target.value))}
                className="flex-1 accent-ink"
              />
              <span className="bcc-mono w-10 text-right text-[10px] text-ink-soft">
                {posX}%
              </span>
            </label>
            <label className="flex items-center gap-3">
              <span className="bcc-mono w-20 text-[10px] text-ink-soft">
                Vertical
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={posY}
                disabled={busy}
                onChange={(event) => setPosY(Number(event.target.value))}
                className="flex-1 accent-ink"
              />
              <span className="bcc-mono w-10 text-right text-[10px] text-ink-soft">
                {posY}%
              </span>
            </label>
            {positionDirty && (
              <button
                type="button"
                disabled={busy}
                onClick={() => positionMutation.mutate({ x: posX, y: posY })}
                className="bcc-stencil mt-1 self-start bg-ink px-4 py-1.5 text-[11px] text-cardstock transition disabled:opacity-50"
              >
                {positionMutation.isPending ? "SAVING…" : "SAVE POSITION"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Identity caption + status messages */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-16 md:px-8 md:pt-20">
        <div>
          <h2 className="bcc-stencil text-2xl text-ink md:text-3xl">
            {profile.display_name}
          </h2>
          <p className="bcc-mono mt-1 text-[11px] tracking-[0.16em] text-ink-soft">
            @{profile.handle}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 min-h-[1.5rem]">
          {serverError !== null && (
            <p role="alert" className="bcc-mono text-[11px] text-safety">
              {serverError}
            </p>
          )}
          {savedAt !== null && serverError === null && (
            <p
              role="status"
              className="bcc-mono text-[11px]"
              style={{ color: "var(--verified)" }}
            >
              Saved.
            </p>
          )}
        </div>
      </div>

      {/* Persistent settings nav: rides flush against the bottom edge
          of the hero so the cover + avatar stay visible while the
          content area below changes. */}
      {nav}
    </section>
  );
}
