"use client";

/**
 * IdentityStep — avatar · cover · bio during onboarding. Fully skippable.
 *
 * Seeded from the server-fetched MemberProfile. Avatar/cover uploads
 * commit immediately (each mutation returns the updated MemberProfile,
 * which we swap into local state for the live preview); the bio is saved
 * on Continue via PATCH /me/profile. Reuses the same mutation hooks and
 * size/type guards as the settings ProfileHero — this is a lean editor
 * on the `bcc-onb-*` page-chrome namespace, not the cardstock hero.
 */

import Image from "next/image";
import { useRef, useState } from "react";

import { LandingReveal } from "@/components/landing/LandingReveal";
import {
  useDeleteAvatar,
  useUpdateBio,
  useUploadAvatar,
  useUploadCover,
} from "@/hooks/useUpdateProfile";
import { BccApiError, type MemberProfile } from "@/lib/api/types";
import { isWpMediaUrl } from "@/lib/media";

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

export function IdentityStep({
  profile,
  onBack,
  onDone,
}: {
  profile: MemberProfile;
  onBack: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState<MemberProfile>(profile);
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState<string | null>(null);
  // A brand-new account already has a DEFAULT PeepSo avatar URL, so
  // `avatar_url !== ""` is true from the start — we can't tell a default
  // apart from a real upload on the client. So "Remove" is gated on an
  // in-session change instead: it only appears once the user has actually
  // uploaded their own avatar here.
  const [avatarChanged, setAvatarChanged] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const onMediaSuccess = (updated: MemberProfile) => {
    setCurrent(updated);
    setError(null);
  };
  const onMediaError = (err: BccApiError | Error) => setError(humanize(err));

  const uploadAvatar = useUploadAvatar({
    onSuccess: (updated) => { onMediaSuccess(updated); setAvatarChanged(true); },
    onError: onMediaError,
  });
  const removeAvatar = useDeleteAvatar({
    onSuccess: (updated) => { onMediaSuccess(updated); setAvatarChanged(false); },
    onError: onMediaError,
  });
  const uploadCover = useUploadCover({ onSuccess: onMediaSuccess, onError: onMediaError });
  const updateBio = useUpdateBio();

  const busy =
    uploadAvatar.isPending ||
    removeAvatar.isPending ||
    uploadCover.isPending ||
    updateBio.isPending;

  const hasAvatar = current.avatar_url !== "";
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
    if (bio.trim() === current.bio.trim()) {
      onDone();
      return;
    }
    setError(null);
    updateBio.mutate(
      { bio: bio.trim() },
      {
        onSuccess: () => onDone(),
        onError: (err) => setError(humanize(err)),
      },
    );
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
              {(current.display_name[0] ?? "?").toUpperCase()}
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
            className="bcc-onb-textarea"
            value={bio}
            maxLength={BIO_MAX}
            disabled={busy}
            placeholder="What do you build, run, or watch? A line is plenty."
            onChange={(e) => setBio(e.target.value)}
          />
          <p className="bcc-onb-note" style={{ marginTop: "6px", textAlign: "right" }}>
            {bio.length}/{BIO_MAX}
          </p>
        </div>

        {error !== null && (
          <p role="alert" className="bcc-onb-err" style={{ marginTop: "10px" }}>{error}</p>
        )}
      </div>

      <footer className="bcc-onb-foot">
        <button type="button" className="bcc-onb-link" disabled={busy} onClick={onBack}>
          ← Back
        </button>
        <div className="bcc-onb-foot-end">
          <button type="button" className="bcc-onb-link" disabled={busy} onClick={onDone}>
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
