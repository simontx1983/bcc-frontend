"use client";

/**
 * ProfileHero — combined cover banner + avatar overlay, and the owner's
 * editor for both.
 *
 * ## Controls are visible, not hovered
 *
 * The avatar and cover edit affordances used to live in overlays that were
 * `opacity-0` until `:hover` / `:focus-within`. Measured at 360px, all six
 * buttons computed `opacity: 0` with `pointer-events: auto` — invisible but
 * clickable, and on a touch screen there is no hover at all, so a phone
 * owner had no way to discover how to set an avatar. A cold-start profile
 * showed an empty frame and nothing else.
 *
 * They are now a persistent control row in the caption. The overlays were
 * deleted rather than kept as a mouse shortcut: two live control sets would
 * either duplicate every accessible action or need `aria-hidden` +
 * `tabIndex={-1}` on real buttons, and the overlays' `focus-within` reveal
 * would have become dead code.
 *
 * ## Confirmed state
 *
 * `profile` is a server-component prop refreshed asynchronously by
 * `router.refresh()`. Reading it directly meant the UI lagged every save:
 * the heading showed the old name, and a removed avatar stayed on screen
 * until the refresh landed.
 *
 * So each mutation writes the field(s) it owns from its own response into
 * `confirmed`, and the UI reads `confirmed`. Deliberately absent: any
 * attempt to decide whether an incoming prop is "newer" than a local
 * confirmation. Without a server version or timestamp that is unknowable,
 * and guessing it would let a stale refresh silently undo a save. A routine
 * refresh therefore does not touch confirmed fields at all; they re-seed
 * from the server on a real remount, or if this instance is ever reused for
 * a different user (see `confirmedFor`).
 *
 * Consequence, by design: a change made on another device shows up after
 * navigation or a page reload, not live. Real-time sync is out of scope.
 *
 * ## Ownership
 *
 *   display name  → display_name
 *   avatar        → avatar_url
 *   cover up/rm   → cover_photo_url + cover_photo_position
 *   reposition    → cover_photo_position
 *
 * No mutation writes the whole profile just because its response contains
 * one — the display-name mutation is not gated by `busy` and can overlap a
 * media upload, so a full-object write would let either one's stale copy of
 * the other field win on arrival order.
 */

import Image from "next/image";
import { useDirtyRegistration } from "@/hooks/useDirtyRegistration";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { isWpMediaUrl } from "@/lib/media";

import { ActionMenu, type ActionMenuGroup } from "@/components/ui/ActionMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  SettingsSaveStatus,
  type SaveStatus,
} from "@/components/settings/SettingsSaveStatus";
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

/** The fields this component confirms locally. */
interface Owned {
  display_name: string;
  avatar_url: string;
  cover_photo_url: string | null;
  cover_photo_position: { x: number; y: number };
}

function pick(p: MemberProfile): Owned {
  return {
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    cover_photo_url: p.cover_photo_url,
    cover_photo_position: {
      x: p.cover_photo_position.x,
      y: p.cover_photo_position.y,
    },
  };
}

/**
 * The single media status. One state, one live region.
 *
 * Two regions (one per image) looked safe because all five media
 * mutations share `busy` — but `Saved` lingers for three seconds after
 * its mutation settles, so starting a cover save inside that window left
 * two polite regions holding content at once, and a screen reader could
 * hear a stale "Saved" interleaved with the new operation. `subject`
 * carries which image the status is about, so one region can say it.
 *
 * Derived from explicit state rather than from the mutations' own
 * isSuccess/isError, which persist after settling and would survive an
 * identity change.
 */
interface MediaStatus {
  phase: SaveStatus;
  subject: "profile photo" | "cover photo" | null;
  /** Human, code-mapped. Never a raw server message. */
  detail: string | null;
}

const IDLE_MEDIA: MediaStatus = { phase: "idle", subject: null, detail: null };

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

  // ── confirmed state ────────────────────────────────────────────────
  const [confirmed, setConfirmed] = useState<Owned>(() => pick(profile));
  // Re-seed only when this instance is genuinely showing a different
  // person. `id` is the stable user id (`user_id` is its documented alias);
  // `handle` is not stable and must never key this. Adjusting state during
  // render is React's own answer to "reset state when a prop changes" — it
  // re-renders before committing, with no effect and no intermediate paint.
  const [confirmedFor, setConfirmedFor] = useState(profile.id);

  const confirmField = useCallback(
    <K extends keyof Owned>(key: K, value: Owned[K]) => {
      setConfirmed((c) => ({ ...c, [key]: value }));
    },
    [],
  );

  const hasCover =
    confirmed.cover_photo_url !== null && confirmed.cover_photo_url !== "";
  const hasAvatar = confirmed.avatar_url !== "";

  // ── local UI state ─────────────────────────────────────────────────
  const [media, setMedia] = useState<MediaStatus>(IDLE_MEDIA);
  const [confirming, setConfirming] = useState<null | "avatar" | "cover">(null);
  const [focusAfter, setFocusAfter] = useState<null | "avatar" | "cover">(null);

  const [reposMode, setReposMode] = useState(false);
  const [posX, setPosX] = useState(profile.cover_photo_position.x);
  const [posY, setPosY] = useState(profile.cover_photo_position.y);

  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.display_name);
  const [nameError, setNameError] = useState<string | null>(null);

  // ── identity reset ─────────────────────────────────────────────────
  //
  // Every piece of state above is owned by ONE profile. If this instance
  // is ever reused for a different person, keeping any of it would show
  // one operator's half-typed name, open dialog, crop coordinates or
  // "Saved" over another's profile.
  //
  // In practice the panel is `ownerOnly`, so a different identity means
  // the tab is not rendered at all and the component unmounts — but that
  // is a property of a sibling component, not of this one, and it is not
  // worth betting a cross-account state leak on. The reset is cheap.
  //
  // Adjusting state during render is React's documented answer to
  // "reset state when a prop changes": it re-renders immediately, before
  // committing, with no effect, no extra paint and no hook-order change
  // (every hook above still runs in the same order every render).
  //
  // `id` is the stable user id — `user_id` is its documented alias, and
  // `handle` is explicitly NOT stable, so it must never key this.
  if (confirmedFor !== profile.id) {
    setConfirmedFor(profile.id);
    setConfirmed(pick(profile));
    setMedia(IDLE_MEDIA);
    setConfirming(null);
    setFocusAfter(null);
    setReposMode(false);
    setPosX(profile.cover_photo_position.x);
    setPosY(profile.cover_photo_position.y);
    setNameEditing(false);
    setNameDraft(profile.display_name);
    setNameError(null);
    // Mutation results are NOT read for status anywhere in this
    // component (see MediaStatus), so a settled mutation from the
    // previous profile cannot surface. `isPending` is the only thing
    // read from them, and an in-flight request belongs to whoever is
    // still on screen.
  }

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement | null>(null);
  const editNameRef = useRef<HTMLButtonElement | null>(null);
  const wasEditingName = useRef(false);

  // ── mutations ──────────────────────────────────────────────────────
  const nameMutation = useUpdateBio({
    onSuccess: (data) => {
      // The server-confirmed value, not the submitted one — the server
      // sanitises, so they can differ.
      confirmField("display_name", data.display_name);
      setNameEditing(false);
      setNameError(null);
      router.refresh();
    },
    onError: (err: BccApiError | Error) => {
      setNameError(humanizeError(err));
    },
  });

  const savingMedia = (subject: MediaStatus["subject"]) =>
    setMedia({ phase: "saving", subject, detail: null });
  const savedMedia = (subject: MediaStatus["subject"]) =>
    setMedia({ phase: "saved", subject, detail: null });
  const failedMedia = (subject: MediaStatus["subject"], err: BccApiError | Error) =>
    setMedia({ phase: "error", subject, detail: humanizeError(err) });

  const uploadAvatar = useUploadAvatar({
    onSuccess: (data) => {
      confirmField("avatar_url", data.avatar_url);
      savedMedia("profile photo");
      router.refresh();
    },
    onError: (err: BccApiError | Error) => failedMedia("profile photo", err),
  });

  const removeAvatar = useDeleteAvatar({
    onSuccess: (data) => {
      confirmField("avatar_url", data.avatar_url);
      savedMedia("profile photo");
      setConfirming(null);
      // The menu item that opened the dialog is gone (Remove → Add), so
      // Dialog's own focus-return has nothing to return to.
      setFocusAfter("avatar");
      router.refresh();
    },
    // Deliberately no setConfirming(null): the dialog stays open so the
    // failure is reported where the decision was made, with a retry.
    onError: (err: BccApiError | Error) => failedMedia("profile photo", err),
  });

  const uploadCover = useUploadCover({
    onSuccess: (data) => {
      confirmField("cover_photo_url", data.cover_photo_url);
      confirmField("cover_photo_position", {
        x: data.cover_photo_position.x,
        y: data.cover_photo_position.y,
      });
      savedMedia("cover photo");
      router.refresh();
    },
    onError: (err: BccApiError | Error) => failedMedia("cover photo", err),
  });

  const removeCover = useDeleteCover({
    onSuccess: (data) => {
      confirmField("cover_photo_url", data.cover_photo_url);
      confirmField("cover_photo_position", {
        x: data.cover_photo_position.x,
        y: data.cover_photo_position.y,
      });
      savedMedia("cover photo");
      setConfirming(null);
      setFocusAfter("cover");
      setReposMode(false);
      router.refresh();
    },
    onError: (err: BccApiError | Error) => failedMedia("cover photo", err),
  });

  const positionMutation = useUpdateCoverPosition({
    onSuccess: (data) => {
      confirmField("cover_photo_position", {
        x: data.cover_photo_position.x,
        y: data.cover_photo_position.y,
      });
      savedMedia("cover photo");
      setReposMode(false);
      router.refresh();
    },
    onError: (err: BccApiError | Error) => failedMedia("cover photo", err),
  });

  // ── focus restoration ──────────────────────────────────────────────
  useEffect(() => {
    if (focusAfter === null) return;
    // Both removals hand focus back to the one stable anchor: the menu
    // trigger. The menu item that was activated no longer exists (Remove
    // became Add), and the menu itself is closed, so there is nothing
    // else to return to.
    menuAnchorRef.current?.querySelector("button")?.focus();
    setFocusAfter(null);
  }, [focusAfter]);

  useEffect(() => {
    // Only on the edit→read transition, so mounting the hero never steals
    // focus.
    if (wasEditingName.current && !nameEditing) {
      editNameRef.current?.focus();
    }
    wasEditingName.current = nameEditing;
  }, [nameEditing]);

  // ── dirty registration ─────────────────────────────────────────────
  // Both gated on their editing mode: opening the editor or entering
  // reposition mode is not itself a change.
  useDirtyRegistration({
    id: "profile.displayName",
    label: "your display name",
    isDirty: nameEditing && nameDraft.trim() !== confirmed.display_name.trim(),
    isSaving: nameMutation.isPending,
  });
  useDirtyRegistration({
    id: "profile.coverPosition",
    label: "your cover photo position",
    isDirty:
      reposMode &&
      (posX !== confirmed.cover_photo_position.x ||
        posY !== confirmed.cover_photo_position.y),
    isSaving: positionMutation.isPending,
  });

  const busy =
    uploadCover.isPending ||
    removeCover.isPending ||
    positionMutation.isPending ||
    uploadAvatar.isPending ||
    removeAvatar.isPending;

  const positionDirty =
    posX !== confirmed.cover_photo_position.x ||
    posY !== confirmed.cover_photo_position.y;

  /**
   * Only actions that currently apply are rendered — no disabled "Remove"
   * on a profile with no photo. Because the items are derived from
   * `confirmed`, a successful removal flips Remove/Change → Add on the
   * next render, with no refresh.
   *
   * "Profile photo" rather than "avatar" in every user-facing string;
   * the code keeps the internal names.
   *
   * All items go inert while any media mutation is in flight: the five
   * operations write the same two images, so starting a second one
   * mid-flight could only race the first.
   */
  const photoMenuGroups: ActionMenuGroup[] = [
    {
      id: "profile-photo",
      label: "PROFILE PHOTO",
      items: hasAvatar
        ? [
            {
              id: "change-avatar",
              label: "Change profile photo",
              disabled: busy,
              onSelect: () => avatarInputRef.current?.click(),
            },
            {
              id: "remove-avatar",
              label: "Remove profile photo",
              disabled: busy,
              destructive: true,
              onSelect: () => openRemoveDialog("avatar"),
            },
          ]
        : [
            {
              id: "add-avatar",
              label: "Add profile photo",
              disabled: busy,
              onSelect: () => avatarInputRef.current?.click(),
            },
          ],
    },
    {
      id: "cover-photo",
      label: "COVER PHOTO",
      items: hasCover
        ? [
            {
              id: "change-cover",
              label: "Change cover photo",
              disabled: busy,
              onSelect: () => coverInputRef.current?.click(),
            },
            {
              id: "reposition-cover",
              label: "Reposition cover photo",
              disabled: busy,
              onSelect: enterRepositionMode,
            },
            {
              id: "remove-cover",
              label: "Remove cover photo",
              disabled: busy,
              destructive: true,
              onSelect: () => openRemoveDialog("cover"),
            },
          ]
        : [
            {
              id: "add-cover",
              label: "Add cover photo",
              disabled: busy,
              onSelect: () => coverInputRef.current?.click(),
            },
          ],
    },
  ];

  // Live preview while dragging; the confirmed crop otherwise.
  const objectPosition = reposMode
    ? `${posX}% ${posY}%`
    : `${confirmed.cover_photo_position.x}% ${confirmed.cover_photo_position.y}%`;

  // ── handlers ───────────────────────────────────────────────────────
  function saveDisplayName() {
    const candidate = nameDraft.trim();
    if (candidate === confirmed.display_name) {
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
  }

  function handleCoverChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setMedia(IDLE_MEDIA);
    if (file.size > COVER_MAX_BYTES) {
      setMedia({
        phase: "error",
        subject: "cover photo",
        detail: `Cover photo must be 5 MB or smaller (yours is ${humanFileSize(file.size)}).`,
      });
      event.target.value = "";
      return;
    }
    savingMedia("cover photo");
    uploadCover.mutate(file);
    event.target.value = "";
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setMedia(IDLE_MEDIA);
    if (file.size > AVATAR_MAX_BYTES) {
      setMedia({
        phase: "error",
        subject: "profile photo",
        detail: `Profile photo must be 2 MB or smaller (yours is ${humanFileSize(file.size)}).`,
      });
      event.target.value = "";
      return;
    }
    savingMedia("profile photo");
    uploadAvatar.mutate(file);
    event.target.value = "";
  }

  function enterRepositionMode() {
    // Seed the sliders from the confirmed crop so the drag starts where the
    // image actually sits.
    setPosX(confirmed.cover_photo_position.x);
    setPosY(confirmed.cover_photo_position.y);
    setReposMode(true);
  }

  function openRemoveDialog(which: "avatar" | "cover") {
    // Clear any prior outcome so the dialog doesn't open pre-errored and
    // a stale "Saved" doesn't sit beside a new decision.
    setMedia(IDLE_MEDIA);
    setConfirming(which);
  }

  return (
    <section className="bcc-panel overflow-hidden">
      {/* Cover REGION — the avatar's positioning context, and the reason
          this wrapper exists at all.

          The avatar hangs 48px BELOW the cover's bottom edge (`-bottom-12`,
          with the caption row's `pt-16` reserving the landing space). It
          used to be a child of the cover box, which is `overflow-hidden` so
          the uploaded photo stays inside its frame — so the browser
          amputated the avatar at the cover's bottom edge.

          This wrapper is deliberately NOT a clipping box: it gives the
          avatar a containing block with the same geometry the cover box
          had, while leaving the cover's own `overflow-hidden` in place to
          keep the photo in its frame.
          Do NOT add `overflow-hidden` here; see profile-hero-avatar-clip.test.tsx. */}
      <div className="relative">
        {/* Cover banner */}
        <div
          data-bcc-hero="cover"
          className="relative h-40 w-full overflow-hidden bg-cardstock-deep md:h-56"
          style={{ aspectRatio: "3 / 1" }}
        >
          {hasCover && isWpMediaUrl(confirmed.cover_photo_url ?? "") ? (
            // Above-fold hero — `priority` skips lazy-loading so the
            // banner doesn't pop in after the panel paints.
            <Image
              src={confirmed.cover_photo_url ?? ""}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
              style={{ objectPosition }}
            />
          ) : hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element -- non-WP host — outside the next/image allowlist; see lib/media.ts
            <img
              src={confirmed.cover_photo_url ?? ""}
              alt=""
              decoding="async"
              className="h-full w-full object-cover"
              style={{ objectPosition }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cardstock-deep to-cardstock-edge">
              <span className="bcc-mono text-[10px] tracking-[0.2em] text-ink-soft">
                NO COVER PHOTO
              </span>
            </div>
          )}
        </div>

        {/* Avatar — SIBLING of the cover box, not a child: its bottom half
            lands outside the cover's frame, and the cover box clips. */}
        <div
          data-bcc-hero="avatar"
          className="absolute -bottom-12 left-6 md:left-8"
        >
          <div className="relative h-24 w-24 overflow-hidden border-4 border-cardstock bg-cardstock-deep shadow-md md:h-28 md:w-28">
            {hasAvatar && isWpMediaUrl(confirmed.avatar_url) ? (
              <Image
                src={confirmed.avatar_url}
                alt={`${confirmed.display_name}'s avatar`}
                fill
                priority
                sizes="112px"
                className="object-cover"
              />
            ) : hasAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- non-WP host — outside the next/image allowlist; see lib/media.ts
              <img
                src={confirmed.avatar_url}
                alt={`${confirmed.display_name}'s avatar`}
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-cardstock-deep">
                <span className="bcc-stencil text-3xl text-ink-soft">
                  {(confirmed.display_name[0] ?? "?").toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reposition controls — appear when Reposition is clicked.

          `pt-16 md:pt-20` mirrors the caption row below for the same
          reason: the avatar's lower 48px land on whatever follows the
          cover, and in reposition mode that is this panel. */}
      {hasCover && reposMode && (
        <div className="border-t border-bcc-border bg-bcc-surface-hover px-6 pb-4 pt-16 md:pt-20">
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
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                disabled={busy || !positionDirty}
                onClick={() => {
                  savingMedia("cover photo");
                  positionMutation.mutate({ x: posX, y: posY });
                }}
                className="bcc-stencil self-start bg-ink px-4 py-1.5 text-[11px] text-cardstock transition disabled:opacity-50"
              >
                Save position
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReposMode(false)}
                className="bcc-mono px-2 py-1.5 text-[11px] text-bcc-text-secondary hover:text-bcc-text"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Identity caption + the photo control row.

          The control row sits in the slot that previously held only a
          status line. That slot is already inside the `pt-16 md:pt-20`
          clearance reserved for the avatar's overhang, so on wide screens
          it occupies space that was empty. Below `sm` it wraps onto its own
          line — the one place the row costs height. */}
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
                aria-invalid={nameError !== null}
                {...(nameError !== null
                  ? { "aria-describedby": "bcc-display-name-error" }
                  : {})}
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
                {nameMutation.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameEditing(false);
                  setNameError(null);
                }}
                className="bcc-mono px-2 py-1.5 text-[11px] text-bcc-text-secondary hover:text-bcc-text"
              >
                Cancel
              </button>
            </form>
          ) : (
            <h2 className="bcc-stencil flex items-center gap-2 text-2xl text-bcc-text md:text-3xl">
              {/* Confirmed, not the prop: the prop lags a save by the length
                  of router.refresh(). */}
              {confirmed.display_name}
              <button
                type="button"
                ref={editNameRef}
                aria-label="Edit display name"
                onClick={() => {
                  setNameDraft(confirmed.display_name);
                  setNameEditing(true);
                }}
                /* Colour cannot carry this affordance.

                   It was `text-blueprint`, a FIXED navy (#0F1E3C). That is
                   right on the cardstock surface family, but `bcc-panel` is
                   theme-aware: in dark it put #0F1E3C on #161b22 and
                   measured 1.05:1, so the only way to edit your display name
                   was invisible.

                   No accent token fixes it. Measured against the panel in
                   both themes (light / dark): accent 2.39 / 7.24,
                   accent-dark 3.74 / 4.62, accent-light 1.86 / 9.29, info
                   3.68 / 4.70. Every one fails 4.5:1 on one side — the
                   accent family is tuned for a dark ground. Only --bcc-text
                   (17.74 / 14.64) and --bcc-text-secondary (7.56 / 5.62)
                   clear both.

                   So the affordance moves off colour and onto a persistent
                   underline, and the text takes the body token. Text at
                   10px is normal text, so the bar is 4.5:1, not 3:1.

                   Other `text-blueprint` sites sit on theme-aware panels too
                   and look like the same hazard; they are recorded as
                   follow-up rather than swept into this PR. */
                className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text underline underline-offset-2 hover:no-underline"
              >
                EDIT
              </button>
            </h2>
          )}
          {nameError !== null && (
            <p
              id="bcc-display-name-error"
              role="alert"
              className="bcc-mono mt-1 text-[11px] text-safety"
            >
              {nameError}
            </p>
          )}
          <p className="bcc-mono mt-1 text-[11px] tracking-[0.16em] text-bcc-text-secondary">
            @{profile.handle}
          </p>
        </div>

        {/* One labelled trigger, not a wall of buttons.

            The first pass put five labelled controls here. Measured, they
            never fit beside the name — the profile column is 680px and the
            row needs ~600px — so they wrapped at every width and added
            ~118px to the hero. A single trigger restores one compact row.

            Text label, never icon-only: "⋯" alone does not tell a
            first-time owner what it controls. */}
        <div ref={menuAnchorRef} className="flex flex-col items-start gap-2">
          <input
            ref={avatarInputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            onChange={handleAvatarChange}
            disabled={busy}
            className="hidden"
          />
          <input
            ref={coverInputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            onChange={handleCoverChange}
            disabled={busy}
            className="hidden"
          />
          <ActionMenu
            triggerLabel="Edit photos"
            groups={photoMenuGroups}
            after={
              /* ONE media live region. See MediaStatus. */
              <SettingsSaveStatus
                status={confirming === null ? media.phase : "idle"}
                minWidthClass="min-w-[180px]"
                savingLabel={
                  media.subject === null ? "Saving…" : `Saving your ${media.subject}…`
                }
                savedLabel={
                  media.subject === null
                    ? "Saved"
                    : `${media.subject === "profile photo" ? "Profile" : "Cover"} photo saved.`
                }
                errorLabel={
                  media.subject === null
                    ? undefined
                    : `Couldn't update your ${media.subject}.${media.detail !== null ? ` ${media.detail}` : ""}`
                }
              />
            }
          />
        </div>
      </div>

      {confirming === "avatar" && (
        <ConfirmDialog
          title="Remove your avatar?"
          body="Your profile will show your initial instead. You can upload a new one anytime."
          confirmLabel="Remove photo"
          cancelLabel="Keep photo"
          retryLabel="Try again"
          errorMessage={
            media.phase === "error" && media.subject === "profile photo"
              ? media.detail
              : null
          }
          pending={removeAvatar.isPending}
          onConfirm={() => {
            savingMedia("profile photo");
            removeAvatar.mutate();
          }}
          onCancel={() => {
            setConfirming(null);
            setMedia(IDLE_MEDIA);
          }}
        />
      )}

      {confirming === "cover" && (
        <ConfirmDialog
          title="Remove your cover image?"
          body="Your profile will show a plain background instead. You can upload a new one anytime."
          confirmLabel="Remove cover"
          cancelLabel="Keep cover"
          retryLabel="Try again"
          errorMessage={
            media.phase === "error" && media.subject === "cover photo"
              ? media.detail
              : null
          }
          pending={removeCover.isPending}
          onConfirm={() => {
            savingMedia("cover photo");
            removeCover.mutate();
          }}
          onCancel={() => {
            setConfirming(null);
            setMedia(IDLE_MEDIA);
          }}
        />
      )}

      {/* Persistent settings nav: rides flush against the bottom edge
          of the hero so the cover + avatar stay visible while the
          content area below changes. */}
      {nav}
    </section>
  );
}
