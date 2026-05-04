"use client";

/**
 * ProfileSettingsForm — §V2 Phase 2 Profile + account settings.
 *
 * Three independently-saveable sections:
 *   1. Bio — text PATCH (max 500 chars, server sanitizes with
 *      sanitize_textarea_field — strips ALL tags)
 *   2. Avatar — multipart POST → wraps PeepSoUser::move_avatar_file.
 *      Delete reverts to default (Gravatar / initial monogram fallback,
 *      depending on PeepSo's configuration)
 *   3. Cover photo — multipart POST → wraps PeepSoUser::move_cover_file.
 *      Delete removes the cover entirely.
 *
 * No optimistic update — image uploads can fail silently (network drops,
 * server-side processing errors, MIME mismatch detected after upload),
 * so we only show the new image after the server returns the updated
 * MemberProfile. Bio updates are also non-optimistic for consistency
 * with IdentitySettingsForm's approach.
 *
 * After a successful mutation, `router.refresh()` rehydrates server
 * props (page header avatar, etc.) so other UI surfaces don't show a
 * stale value.
 */

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import {
  useDeleteAvatar,
  useDeleteCover,
  useUpdateBio,
  useUpdateCoverPosition,
  useUploadAvatar,
  useUploadCover,
} from "@/hooks/useUpdateProfile";
import { BccApiError, type MemberProfile } from "@/lib/api/types";

const BIO_MAX = 500;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — must match server
const COVER_MAX_BYTES = 5 * 1024 * 1024;  // 5 MB — must match server
const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:    "We couldn't accept that. Check the field and try again.",
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

interface ProfileSettingsFormProps {
  initialProfile: MemberProfile;
}

export function ProfileSettingsForm({ initialProfile }: ProfileSettingsFormProps) {
  return (
    <div className="flex flex-col gap-8">
      <BioSection initialBio={initialProfile.bio} />
      <AvatarSection currentUrl={initialProfile.avatar_url} />
      <CoverSection
        currentUrl={initialProfile.cover_photo_url}
        initialPosition={initialProfile.cover_photo_position}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bio
// ─────────────────────────────────────────────────────────────────────

function BioSection({ initialBio }: { initialBio: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialBio);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useUpdateBio({
    onSuccess: (data) => {
      setDraft(data.bio);
      setSavedAt(Date.now());
      setServerError(null);
      router.refresh();
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const trimmed = draft.trim();
  const isUnchanged = trimmed === initialBio.trim();
  const isOverLimit = draft.length > BIO_MAX;
  const canSave = !isUnchanged && !isOverLimit && !mutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setServerError(null);
    setSavedAt(null);
    mutation.mutate({ bio: draft });
  }

  return (
    <section className="bcc-panel p-6">
      <h2 className="bcc-stencil text-xl text-ink">Bio</h2>
      <p className="bcc-mono mt-1 text-[11px] text-ink-soft">
        A short description that appears on your profile. Plain text only.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          maxLength={BIO_MAX + 50}
          className="w-full resize-y border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint"
        />

        <div className="flex items-center justify-between gap-4">
          <span
            className={`bcc-mono text-[11px] ${
              isOverLimit ? "text-safety" : "text-ink-soft/70"
            }`}
          >
            {draft.length} / {BIO_MAX}
          </span>
          <button
            type="submit"
            disabled={!canSave}
            className="bcc-stencil bg-ink px-5 py-2.5 text-cardstock transition disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save bio"}
          </button>
        </div>

        {serverError !== null && (
          <p role="alert" className="bcc-mono text-safety">
            {serverError}
          </p>
        )}

        {savedAt !== null && serverError === null && (
          <p
            role="status"
            className="bcc-mono"
            style={{ color: "var(--verified)" }}
          >
            Bio saved.
          </p>
        )}
      </form>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────

function AvatarSection({ currentUrl }: { currentUrl: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const upload = useUploadAvatar({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      router.refresh();
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const remove = useDeleteAvatar({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      router.refresh();
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setSavedAt(null);
    setServerError(null);

    if (file.size > AVATAR_MAX_BYTES) {
      setServerError(`Avatar must be 2 MB or smaller (yours is ${humanFileSize(file.size)}).`);
      // Reset the input so a re-pick of the same file fires onChange again.
      event.target.value = "";
      return;
    }
    upload.mutate(file);
    event.target.value = "";
  }

  const busy = upload.isPending || remove.isPending;

  return (
    <section className="bcc-panel p-6">
      <h2 className="bcc-stencil text-xl text-ink">Avatar</h2>
      <p className="bcc-mono mt-1 text-[11px] text-ink-soft">
        Square image, JPEG / PNG / WebP, up to 2 MB. Removing it reverts
        to the default Gravatar / initials.
      </p>

      <div className="mt-4 flex items-center gap-5">
        <div className="h-20 w-20 overflow-hidden border border-cardstock-edge bg-cardstock-deep">
          {currentUrl !== "" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt="Your current avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="bcc-mono flex h-full items-center justify-center text-[10px] text-ink-soft">
              none
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            onChange={handleFileChange}
            disabled={busy}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="bcc-stencil bg-ink px-5 py-2 text-cardstock transition disabled:opacity-50"
          >
            {upload.isPending ? "Uploading…" : "Choose image"}
          </button>
          {currentUrl !== "" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSavedAt(null);
                setServerError(null);
                remove.mutate();
              }}
              className="bcc-mono text-[11px] text-safety underline disabled:opacity-50"
            >
              {remove.isPending ? "Removing…" : "Remove avatar"}
            </button>
          )}
        </div>
      </div>

      {serverError !== null && (
        <p role="alert" className="bcc-mono mt-3 text-safety">
          {serverError}
        </p>
      )}
      {savedAt !== null && serverError === null && (
        <p
          role="status"
          className="bcc-mono mt-3"
          style={{ color: "var(--verified)" }}
        >
          Avatar updated.
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cover photo
// ─────────────────────────────────────────────────────────────────────

function CoverSection({
  currentUrl,
  initialPosition,
}: {
  currentUrl: string | null;
  initialPosition: { x: number; y: number };
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Local crop position — slider drag updates immediately; only the
  // Save button persists to server. Mirrors initialPosition on every
  // server-side refresh.
  const [posX, setPosX] = useState(initialPosition.x);
  const [posY, setPosY] = useState(initialPosition.y);

  const upload = useUploadCover({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      router.refresh();
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const remove = useDeleteCover({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      router.refresh();
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const positionMutation = useUpdateCoverPosition({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      router.refresh();
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const positionDirty =
    posX !== initialPosition.x || posY !== initialPosition.y;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setSavedAt(null);
    setServerError(null);

    if (file.size > COVER_MAX_BYTES) {
      setServerError(`Cover photo must be 5 MB or smaller (yours is ${humanFileSize(file.size)}).`);
      event.target.value = "";
      return;
    }
    upload.mutate(file);
    event.target.value = "";
  }

  const busy =
    upload.isPending || remove.isPending || positionMutation.isPending;
  const hasCover = currentUrl !== null && currentUrl !== "";

  return (
    <section className="bcc-panel p-6">
      <h2 className="bcc-stencil text-xl text-ink">Cover photo</h2>
      <p className="bcc-mono mt-1 text-[11px] text-ink-soft">
        Wide banner image (1500×500 recommended), JPEG / PNG / WebP,
        up to 5 MB.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div
          className="h-32 w-full overflow-hidden border border-cardstock-edge bg-cardstock-deep"
          style={{ aspectRatio: "3 / 1" }}
        >
          {hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt="Your current cover photo"
              className="h-full w-full object-cover"
              style={{ objectPosition: `${posX}% ${posY}%` }}
            />
          ) : (
            <span className="bcc-mono flex h-full items-center justify-center text-[10px] text-ink-soft">
              no cover photo set
            </span>
          )}
        </div>

        {hasCover && (
          <div className="flex flex-col gap-2 border-l-2 border-cardstock-edge/50 pl-3">
            <span className="bcc-mono text-[11px] text-ink-soft">
              Crop position — drag the sliders to reframe.
            </span>
            <label className="flex items-center gap-3">
              <span className="bcc-mono w-16 text-[10px] text-ink-soft">
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
              <span className="bcc-mono w-16 text-[10px] text-ink-soft">
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
                onClick={() => {
                  setSavedAt(null);
                  setServerError(null);
                  positionMutation.mutate({ x: posX, y: posY });
                }}
                className="bcc-stencil mt-1 self-start bg-ink px-4 py-1.5 text-[11px] text-cardstock transition disabled:opacity-50"
              >
                {positionMutation.isPending ? "Saving…" : "Save position"}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            onChange={handleFileChange}
            disabled={busy}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="bcc-stencil bg-ink px-5 py-2 text-cardstock transition disabled:opacity-50"
          >
            {upload.isPending ? "Uploading…" : "Choose image"}
          </button>
          {hasCover && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSavedAt(null);
                setServerError(null);
                remove.mutate();
              }}
              className="bcc-mono text-[11px] text-safety underline disabled:opacity-50"
            >
              {remove.isPending ? "Removing…" : "Remove cover"}
            </button>
          )}
        </div>
      </div>

      {serverError !== null && (
        <p role="alert" className="bcc-mono mt-3 text-safety">
          {serverError}
        </p>
      )}
      {savedAt !== null && serverError === null && (
        <p
          role="status"
          className="bcc-mono mt-3"
          style={{ color: "var(--verified)" }}
        >
          Cover photo updated.
        </p>
      )}
    </section>
  );
}

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
