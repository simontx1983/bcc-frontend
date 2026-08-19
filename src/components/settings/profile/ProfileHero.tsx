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

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { isWpMediaUrl } from "@/lib/media";

import {
  useDeleteAvatar,
  useDeleteCover,
  useUpdateBio,
  useUpdateCoverPosition,
  useUploadAvatar,
  useUploadCover,
} from "@/hooks/useUpdateProfile";
import { BccApiError, type MemberProfile } from "@/lib/api/types";
import { publicDisplayNameOrEmpty } from "@/lib/format";

const DISPLAY_NAME_MAX = 60;

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
  // §γ — keyed on err.code; unmapped codes fall back to generic copy,
  // never the server's raw err.message.
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Something went wrong. Try again.";
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

  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.display_name);
  const [nameError, setNameError] = useState<string | null>(null);

  const nameMutation = useUpdateBio({
    onSuccess: () => {
      setNameEditing(false);
      setNameError(null);
      onMutationSuccess();
    },
    onError: (err: BccApiError | Error) => {
      setNameError(humanizeError(err));
    },
  });

  const saveDisplayName = () => {
    const candidate = nameDraft.trim();
    if (candidate === profile.display_name) {
      setNameEditing(false);
      return;
    }
    // Client mirror of the server hygiene gate — saves the round-trip;
    // the server 422 remains the authority.
    if (candidate.length === 0 || candidate.length > DISPLAY_NAME_MAX) {
      setNameError(`Display name must be 1–${DISPLAY_NAME_MAX} characters.`);
      return;
    }
    if (publicDisplayNameOrEmpty(candidate) === "") {
      setNameError('Display names can\'t contain "@" or start with "u_".');
      return;
    }
    nameMutation.mutate({ display_name: candidate });
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
        {hasCover && isWpMediaUrl(profile.cover_photo_url ?? "") ? (
          // Above-fold hero — `priority` skips lazy-loading so the
          // banner doesn't pop in after the panel paints.
          <Image
            src={profile.cover_photo_url ?? ""}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: `${posX}% ${posY}%` }}
          />
        ) : hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element -- non-WP host — outside the next/image allowlist; see lib/media.ts
          <img
            src={profile.cover_photo_url ?? ""}
            alt=""
            decoding="async"
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

        {/* Hover overlay — cover edit affordances.

            Every button in here (and in the avatar overlay below) is driven
            off the same `busy` flag, so they all enter the disabled state
            together. They used to do it with `disabled:opacity-50`, which
            dims the plate and the label by the same factor and therefore
            collapses the contrast between them: the ink siblings fell to
            3.16:1 / 3.97:1 and the safety badges to 1.70:1 / 1.85:1. That
            state is not decorative — it renders "UPLOADING…" / "REMOVING…",
            i.e. it is the only place the operator is told what is happening.
            The whole row now dims the TEXT only (`disabled:text-cardstock/70`,
            floor 6.25:1) and signals unavailability with `disabled:cursor-wait`,
            so the plate — and the status copy on it — survives. */}
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
            className="bcc-mono border border-cardstock bg-ink/80 px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock backdrop-blur transition hover:bg-ink disabled:cursor-wait disabled:text-cardstock/70"
          >
            {uploadCover.isPending ? "UPLOADING…" : hasCover ? "CHANGE COVER" : "ADD COVER"}
          </button>
          {hasCover && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReposMode((v) => !v)}
                className="bcc-mono border border-cardstock bg-ink/80 px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock backdrop-blur transition hover:bg-ink disabled:cursor-wait disabled:text-cardstock/70"
              >
                {reposMode ? "DONE" : "REPOSITION"}
              </button>
              {/* Destructive action — same opaque ink plate as its two
                  siblings, marked by a safety stripe on the leading edge
                  rather than a safety FILL. `bg-safety/80` + `text-cardstock`
                  measured 2.63:1 over a white cover and cannot be rescued at
                  any alpha: safety's luminance (0.26) sits between ink (0.004)
                  and cardstock (0.79), so alpha only slides the plate along
                  that axis and the ceiling is 2.71:1 at full opacity. Opaque
                  ink cancels the image term entirely — 15.51:1 regardless of
                  what the operator uploaded. Safety survives as a mark only
                  (§5.4 "color the mark, not the word"); the ink plate and the
                  cardstock hairline carry the boundary between them, so the
                  stripe is decorative and never load-bearing. `backdrop-blur`
                  went with the alpha — it composites nothing behind an opaque
                  plate. */}
              <button
                type="button"
                disabled={busy}
                onClick={() => removeCover.mutate()}
                className="bcc-mono border border-cardstock border-l-[3px] border-l-safety bg-ink px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock transition hover:bg-ink-soft disabled:cursor-wait disabled:text-cardstock/70"
              >
                {removeCover.isPending ? "REMOVING…" : "REMOVE"}
              </button>
            </>
          )}
        </div>

        {/* Avatar overlay — sits half-over the cover, half-over the panel.
            Sprint-1-deferred consolidation candidate: this is the
            own-avatar EDITOR surface (cover frame + hover CHANGE/REMOVE
            overlay), not a plain identity render. Consolidating into the
            shared <Avatar> primitive would either drop the editor chrome
            or push a circular avatar inside the existing square framed
            cover, which clashes visually. Promote when an editor
            variant of Avatar exists. */}
        <div className="group/avatar absolute -bottom-12 left-6 md:left-8">
          <div className="relative h-24 w-24 overflow-hidden border-4 border-cardstock bg-cardstock-deep shadow-md md:h-28 md:w-28">
            {hasAvatar && isWpMediaUrl(profile.avatar_url) ? (
              // Above-fold editor surface — `priority` matches the old
              // eager (no loading="lazy") behavior.
              <Image
                src={profile.avatar_url}
                alt={`${profile.display_name}'s avatar`}
                fill
                priority
                sizes="112px"
                className="object-cover"
              />
            ) : hasAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- non-WP host — outside the next/image allowlist; see lib/media.ts
              <img
                src={profile.avatar_url}
                alt={`${profile.display_name}'s avatar`}
                decoding="async"
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
                className="bcc-mono border border-cardstock bg-ink/85 px-2 py-1 text-[9px] tracking-[0.16em] text-cardstock backdrop-blur transition hover:bg-ink disabled:cursor-wait disabled:text-cardstock/70"
              >
                {uploadAvatar.isPending ? "UPLOADING…" : "CHANGE"}
              </button>
              {/* Same opaque-ink treatment as the cover REMOVE, at the
                  avatar's tighter metrics. `bg-safety/85` measured 2.89:1
                  over a white avatar; opaque ink reads 15.51:1 over any
                  upload. 2px stripe rather than 3px so the mark stays
                  proportional on a ~60px-wide badge. */}
              {hasAvatar && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeAvatar.mutate()}
                  className="bcc-mono border border-cardstock border-l-2 border-l-safety bg-ink px-2 py-1 text-[9px] tracking-[0.16em] text-cardstock transition hover:bg-ink-soft disabled:cursor-wait disabled:text-cardstock/70"
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
        <div className="border-t border-bcc-border bg-bcc-surface-hover px-6 py-4">
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
            CROP POSITION
          </span>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-3">
              <span className="bcc-mono w-20 text-[10px] text-bcc-text-secondary">
                Horizontal
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={posX}
                disabled={busy}
                onChange={(event) => setPosX(Number(event.target.value))}
                className="flex-1 accent-bcc-accent"
              />
              <span className="bcc-mono w-10 text-right text-[10px] text-bcc-text-secondary">
                {posX}%
              </span>
            </label>
            <label className="flex items-center gap-3">
              <span className="bcc-mono w-20 text-[10px] text-bcc-text-secondary">
                Vertical
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={posY}
                disabled={busy}
                onChange={(event) => setPosY(Number(event.target.value))}
                className="flex-1 accent-bcc-accent"
              />
              <span className="bcc-mono w-10 text-right text-[10px] text-bcc-text-secondary">
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
          {nameEditing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveDisplayName();
              }}
            >
              <label htmlFor="bcc-display-name" className="sr-only">
                Display name
              </label>
              <input
                id="bcc-display-name"
                type="text"
                value={nameDraft}
                maxLength={DISPLAY_NAME_MAX}
                autoFocus
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setNameError(null);
                }}
                className="bcc-stencil w-64 bg-bcc-surface-raised px-2 py-1 text-2xl text-bcc-text ring-1 ring-bcc-input-border focus:outline-none focus:ring-2 focus:ring-blueprint md:text-3xl"
              />
              <button
                type="submit"
                disabled={nameMutation.isPending}
                className="bcc-stencil bg-ink px-3 py-1.5 text-[11px] text-cardstock transition disabled:opacity-50"
              >
                {nameMutation.isPending ? "SAVING…" : "SAVE"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameEditing(false);
                  setNameError(null);
                }}
                className="bcc-mono px-2 py-1.5 text-[11px] text-bcc-text-secondary hover:text-bcc-text"
              >
                CANCEL
              </button>
            </form>
          ) : (
            <h2 className="bcc-stencil flex items-center gap-2 text-2xl text-bcc-text md:text-3xl">
              {profile.display_name}
              <button
                type="button"
                aria-label="Edit display name"
                onClick={() => {
                  setNameDraft(profile.display_name);
                  setNameEditing(true);
                }}
                className="bcc-mono text-[10px] tracking-[0.18em] text-blueprint hover:underline"
              >
                EDIT
              </button>
            </h2>
          )}
          {nameError !== null && (
            <p role="alert" className="bcc-mono mt-1 text-[11px] text-safety">
              {nameError}
            </p>
          )}
          <p className="bcc-mono mt-1 text-[11px] tracking-[0.16em] text-bcc-text-secondary">
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
