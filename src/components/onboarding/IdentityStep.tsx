"use client";

import { UploadRightsReminder } from "@/components/media/UploadRightsReminder";

/**
 * IdentityStep — avatar · cover · bio during onboarding. Fully skippable.
 *
 * Seeded from the server-fetched MemberProfile. Avatar/cover uploads
 * commit immediately (each mutation returns the updated MemberProfile,
 * which becomes the preview); the bio is saved on Continue via PATCH
 * /me/profile.
 *
 * F-263 (M24): the step's state lives in the WIZARD (`IdentityDraft`), not
 * here. It used to be local, seeded from the page's server-fetched
 * profile, so leaving the step and coming Back remounted it from that
 * stale seed: a just-uploaded avatar and cover, and a just-saved bio,
 * showed as gone, and a typed bio was thrown away. Back now keeps all of
 * it; Skip still drops only the unsaved bio. Reuses the same mutation hooks and
 * size/type guards as the settings ProfileHero — this is a lean editor
 * on the `bcc-onb-*` page-chrome namespace, not the cardstock hero.
 */

import Image from "next/image";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";

import { LandingReveal } from "@/components/landing/LandingReveal";
import { isPeepSoPlaceholder } from "@/components/identity/Avatar";
import {
  useDeleteAvatar,
  useUpdateBio,
  useUploadAvatar,
  useUploadCover,
} from "@/hooks/useUpdateProfile";
import { BccApiError, type MemberProfile } from "@/lib/api/types";
import { deriveInitials } from "@/lib/format/initials";
import { isWpMediaUrl } from "@/lib/media";
import { CARD_BIO_HINT } from "@/lib/copy/card";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp";
const BIO_MAX = 400;

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:    "We couldn't accept that. Check the file and try again.",
  bcc_unauthorized:       "Sign in required.",
  bcc_upload_failed:      "Upload failed. Try again or pick a different file.",
  bcc_peepso_unavailable: "Image storage isn't available right now. Try again later.",
  bcc_internal_error:     "Server error. Try again.",
};

function humanize(err: BccApiError | Error): string {
  if (err instanceof BccApiError) return ERROR_COPY[err.code] ?? "Something went wrong. Try again.";
  return "Something went wrong. Try again.";
}

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The identity step's state, held by the wizard so it survives the step
 * unmounting (Back, or Back from the next step).
 */
export interface IdentityDraft {
  /**
   * The profile as this session last saw it: the page's server copy, then
   * each upload's response, then the saved bio.
   */
  profile: MemberProfile;
  /** A typed bio not yet saved; null when there is none. */
  bio: string | null;
  /**
   * The member uploaded their own avatar this session. "Remove" only shows
   * then: a fresh account's default PeepSo placeholder isn't something to
   * offer removing.
   */
  avatarChanged: boolean;
}

export function initialIdentityDraft(profile: MemberProfile): IdentityDraft {
  return { profile, bio: null, avatarChanged: false };
}

export function IdentityStep({
  draft,
  onDraftChange,
  onBack,
  onDone,
}: {
  draft: IdentityDraft;
  /** Functional updates: an upload can land after the bio was typed. */
  onDraftChange: Dispatch<SetStateAction<IdentityDraft>>;
  onBack: () => void;
  onDone: () => void;
}) {
  const current = draft.profile;
  const bio = draft.bio ?? current.bio;
  const avatarChanged = draft.avatarChanged;
  const setBio = (next: string) => onDraftChange((prev) => ({ ...prev, bio: next }));
  const [error, setError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const onMediaSuccess = (updated: MemberProfile, avatarChangedNow?: boolean) => {
    // The upload's profile replaces the preview; a typed bio is kept.
    onDraftChange((prev) => ({
      ...prev,
      profile: updated,
      avatarChanged: avatarChangedNow ?? prev.avatarChanged,
    }));
    setError(null);
  };
  const onMediaError = (err: BccApiError | Error) => setError(humanize(err));

  const uploadAvatar = useUploadAvatar({
    onSuccess: (updated) => onMediaSuccess(updated, true),
    onError: onMediaError,
  });
  const removeAvatar = useDeleteAvatar({
    onSuccess: (updated) => onMediaSuccess(updated, false),
    onError: onMediaError,
  });
  const uploadCover = useUploadCover({ onSuccess: (updated) => onMediaSuccess(updated), onError: onMediaError });
  const updateBio = useUpdateBio();

  const busy =
    uploadAvatar.isPending ||
    removeAvatar.isPending ||
    uploadCover.isPending ||
    updateBio.isPending;

  const hasAvatar = current.avatar_url !== "" && !isPeepSoPlaceholder(current.avatar_url);
  const hasCover = current.cover_photo_url !== null && current.cover_photo_url !== "";

  function pick(
    event: React.ChangeEvent<HTMLInputElement>,
    maxBytes: number,
    label: string,
    fire: (file: File) => void,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setError(null);
    if (file.size > maxBytes) {
      setError(`${label} must be ${humanFileSize(maxBytes)} or smaller (yours is ${humanFileSize(file.size)}).`);
      return;
    }
    fire(file);
  }

  function handleContinue() {
    const trimmed = bio.trim();
    if (trimmed === current.bio.trim()) {
      onDraftChange((prev) => ({ ...prev, bio: null }));
      onDone();
      return;
    }
    setError(null);
    updateBio.mutate(
      { bio: trimmed },
      {
        onSuccess: () => {
          // Saved: it is the profile's bio now, not a draft.
          onDraftChange((prev) => ({ ...prev, profile: { ...prev.profile, bio: trimmed }, bio: null }));
          onDone();
        },
        onError: (err) => setError(humanize(err)),
      },
    );
  }

  /** Skip abandons only the unsaved bio; uploads are already saved. */
  function handleSkip() {
    onDraftChange((prev) => ({ ...prev, bio: null }));
    onDone();
  }

  return (
    <section className="bcc-onb-step">
      <LandingReveal as="p" className="bcc-onb-eyebrow">
        Your identity
      </LandingReveal>
      <LandingReveal>
        <h1 className="bcc-onb-disp">Put a face to it.</h1>
        <p className="bcc-onb-lede">
          Add an avatar, a cover, and a line about yourself. It&rsquo;s how the floor
          recognises you — but none of it is required. <b>Skip and set it later.</b>
        </p>
      </LandingReveal>

      <div className="bcc-onb-panel" style={{ marginTop: "clamp(24px, 4vw, 40px)" }}>
        <UploadRightsReminder />
        {/* Cover */}
        <div className="bcc-onb-id-cover">
          {hasCover && isWpMediaUrl(current.cover_photo_url ?? "") ? (
            <Image
              src={current.cover_photo_url ?? ""}
              alt=""
              fill
              sizes="(max-width: 1080px) 100vw, 1024px"
              style={{ objectFit: "cover", objectPosition: `${current.cover_photo_position.x}% ${current.cover_photo_position.y}%` }}
            />
          ) : hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element -- non-WP host — outside the next/image allowlist; see lib/media.ts
            <img src={current.cover_photo_url ?? ""} alt="" style={{ objectPosition: `${current.cover_photo_position.x}% ${current.cover_photo_position.y}%` }} />
          ) : (
            <span className="bcc-onb-id-cover-empty">No cover yet</span>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            className="hidden"
            disabled={busy}
            onChange={(e) => pick(e, COVER_MAX_BYTES, "Cover photo", (f) => uploadCover.mutate(f))}
          />
          <button
            type="button"
            className="bcc-onb-id-media-btn"
            disabled={busy}
            onClick={() => coverInputRef.current?.click()}
          >
            {uploadCover.isPending ? "Uploading…" : hasCover ? "Change cover" : "Add cover"}
          </button>
        </div>

        {/* Avatar (overlaps cover) */}
        <div className="bcc-onb-id-avatar">
          {hasAvatar && isWpMediaUrl(current.avatar_url) ? (
            <Image src={current.avatar_url} alt="Your avatar" fill sizes="96px" style={{ objectFit: "cover" }} />
          ) : hasAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- non-WP host — outside the next/image allowlist; see lib/media.ts
            <img src={current.avatar_url} alt="Your avatar" />
          ) : (
            <span className="bcc-onb-id-avatar-empty">
              {deriveInitials(current.display_name, current.handle) || "?"}
            </span>
          )}
        </div>

        <input
          ref={avatarInputRef}
          type="file"
          accept={ACCEPT_IMAGES}
          className="hidden"
          disabled={busy}
          onChange={(e) => pick(e, AVATAR_MAX_BYTES, "Avatar", (f) => uploadAvatar.mutate(f))}
        />
        <div style={{ display: "flex", gap: "10px", margin: "16px 0 0 4px", flexWrap: "wrap" }}>
          <button type="button" className="bcc-onb-mini-btn" disabled={busy} onClick={() => avatarInputRef.current?.click()}>
            {uploadAvatar.isPending ? "Uploading…" : avatarChanged ? "Change avatar" : "Add avatar"}
          </button>
          {avatarChanged && (
            <button type="button" className="bcc-onb-mini-btn" disabled={busy} onClick={() => removeAvatar.mutate()}>
              {removeAvatar.isPending ? "Removing…" : "Remove"}
            </button>
          )}
        </div>

        {/* Bio */}
        <div style={{ marginTop: "24px" }}>
          <label className="bcc-onb-field-label" htmlFor="onb-bio">
            About you <span style={{ textTransform: "none", letterSpacing: "0.02em" }}>(optional)</span>
          </label>
          <textarea
            id="onb-bio"
            aria-describedby="onb-bio-card-hint"
            className="bcc-onb-textarea"
            value={bio}
            maxLength={BIO_MAX}
            disabled={busy}
            placeholder="What do you build, run, or watch? A line is plenty."
            onChange={(e) => setBio(e.target.value)}
          />
          <div className="flex items-baseline justify-between gap-3" style={{ marginTop: "6px" }}>
            <p id="onb-bio-card-hint" className="bcc-onb-note">{CARD_BIO_HINT}</p>
            <p className="bcc-onb-note" style={{ textAlign: "right" }}>
              {bio.length}/{BIO_MAX}
            </p>
          </div>
        </div>

        {error !== null && (
          <p role="alert" className="bcc-onb-err" style={{ marginTop: "10px" }}>{error}</p>
        )}
      </div>

      <footer className="bcc-onb-foot">
        {/*
          Back and Skip are NEVER gated on `busy`. A hung avatar or cover
          upload used to freeze every control on the step, leaving no way
          out. Media commits server-side on its own; navigating away does
          not cancel an upload the server already accepted, and Skip
          deliberately abandons only the UNSAVED bio draft.

          Continue stays gated — that one submits, and double-submitting a
          bio is a real duplicate write.
        */}
        <button type="button" className="bcc-onb-link" onClick={onBack}>
          ← Back
        </button>
        <div className="bcc-onb-foot-end">
          <button type="button" className="bcc-onb-link" onClick={handleSkip}>
            Skip
          </button>
          <button type="button" className="bcc-onb-btn bcc-onb-btn-primary" disabled={busy} onClick={handleContinue}>
            {updateBio.isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </footer>
    </section>
  );
}
