"use client";

/**
 * Crest — the card's 108px circular portrait: either the operator's
 * avatar or a stencil monogram, behind a single accent ring.
 *
 * Was three concentric hex layers on cardstock. The hex retired with the
 * cardstock face; ONE ring is the whole treatment now, and the chain-
 * colour multiply overlay went with it — nothing inside the portrait is
 * tinted by chain or kind any more.
 *
 * A mild saturation/contrast trim survives on the photo so portraits
 * read as ID shots rather than Instagram crops.
 *
 * Fallback: stencil initials in the monogram color when image_url is
 * null (server returns null for pages with no PeepSo photo and members
 * without a Gravatar / WP avatar).
 */

import { type ChangeEvent, type MouseEvent, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { useUploadAvatar } from "@/hooks/useUpdateProfile";
import { useUploadPageAvatar, useDeletePageAvatar } from "@/hooks/usePageAvatar";
import { isWpMediaUrl } from "@/lib/media";
import type { Card } from "@/lib/api/types";

export function Crest({
  card,
  canEditAvatar,
}: {
  card: Card;
  canEditAvatar: boolean;
}) {
  const { initials, image_url: imageUrl } = card.crest;

  // Member cards edit their avatar via /me/profile/avatar (PeepSo member
  // photo); page cards (validator/project/creator) edit via the claimer-
  // gated /pages/{id}/avatar routes, keyed by the card id. We call all
  // hooks unconditionally (Rules of Hooks) and pick the active mutation
  // by card_kind. Member behaviour is unchanged: same hook, same
  // `user-by-handle` invalidation, same router.refresh(); page mutations
  // own their `["card"]` invalidation + refresh inside the hook.
  const isPageCard = card.card_kind !== "member";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Member avatar upload — hover "UPDATE AVATAR" hint, click opens the
  // picker, selection fires the PeepSo upload. Cache invalidation
  // (`user-by-handle`) refreshes the crest after upload; router.refresh()
  // rehydrates the server-rendered profile so adjacent surfaces (header
  // avatar, composer chip) reflect the change without a hard reload.
  const memberUpload = useUploadAvatar({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-by-handle"] });
      router.refresh();
    },
  });

  // Page (claimer) avatar — upload + remove. The hooks invalidate the
  // `["card"]` root and call router.refresh() internally so the crest
  // re-resolves (uploaded image ranks above the auto logo; delete
  // reverts to logo / initials).
  const pageUpload = useUploadPageAvatar(card.id);
  const pageDelete = useDeletePageAvatar(card.id);

  // Active upload mutation drives the picker + pending/error UI. Both
  // hooks expose the React Query shape, so the consuming JSX only needs
  // `.mutate` / `.isPending` / `.isError`.
  const activeUpload = isPageCard ? pageUpload : memberUpload;

  const handleOpenPicker = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    activeUpload.mutate(file);
    // Reset so picking the same file twice re-triggers onChange.
    event.target.value = "";
  };

  const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    pageDelete.mutate();
  };

  const hasImage = imageUrl !== null && imageUrl !== "";
  // Remove affordance is page-only (member avatar removal lives in the
  // settings ProfileHero) and only when an image is actually present.
  const canRemoveImage = canEditAvatar && isPageCard && hasImage;

  return (
    // Outer wrapper deliberately does NOT clip: the REMOVE button and the
    // error line sit outside the circle's edge and would be swallowed by
    // the overflow:hidden that the photo needs.
    <div
      className="group relative"
      style={{ width: 108, height: 108, flex: "none" }}
    >
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={{
          background: "var(--bcc-surface-hover)",
          // ONE ring. The cream inner border, the elite gold halo and the
          // Proven violet ring were all removed during design and are not
          // to be reintroduced — the violet in particular "read as damage,
          // not reward". Pinned --bcc-primary rather than --bcc-accent so
          // the ring can't turn orange on an orange project card.
          boxShadow:
            "0 0 0 3px var(--bcc-primary), 0 6px 14px -4px rgb(var(--bcc-black-rgb) / 0.45)",
        }}
      >
        {hasImage ? (
        // Tailwind's preflight sets `img { max-width: 100%; height: auto }`,
        // which overrides absolute-position sizing for replaced elements.
        // Wrapping in an absolutely-positioned div lets the div take the
        // inset-derived size and the img fill it.
        <div className="absolute inset-0">
          {isWpMediaUrl(imageUrl) ? (
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="108px"
              className="object-cover"
              style={{ filter: "saturate(0.92) contrast(1.02)" }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- non-WP host (page-card art can be NFT/IPFS) — outside the next/image allowlist; see lib/media.ts
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              style={{ filter: "saturate(0.92) contrast(1.02)" }}
            />
          )}
        </div>
      ) : (
        // Initials take the THEME text colour, not the server's
        // `crest.monogram_color`. That value is a fixed hex chosen against
        // the old cream cardstock, so on the theme-aware surface it stayed
        // near-black while the card flipped dark — legible in light mode,
        // nearly invisible in dark. Same class of bug as the `text-ink`
        // rule in CLAUDE.md.
        <span
          className="bcc-stencil relative z-[2]"
          style={{ fontSize: 38, lineHeight: 1, color: "var(--bcc-text-secondary)" }}
        >
          {initials}
        </span>
      )}

        {/* Owner upload affordance — covers the whole circle. Default
            state is invisible (pointer events stay enabled so the click
            target is still live); hover/focus reveals a scrim + UPDATE
            label. The hidden file input is anchored next to the button so
            the picker opens from inside the card without a separate
            modal. */}
        {canEditAvatar && (
          <>
            <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Upload new avatar"
          />
          <button
            type="button"
            onClick={handleOpenPicker}
            aria-label="Update avatar"
            disabled={activeUpload.isPending || pageDelete.isPending}
            // z-[10]: above the card's z-5 .bcc-card-body-link nav overlay
            // (interactive affordances live at 10+ — see globals.css). The
            // old z-[4] only worked while the Portrait wrapper's own
            // stacking context existed, which also made it unclickable.
            className="group absolute inset-0 z-[10] cursor-pointer rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bcc-accent)] disabled:cursor-wait"
          >
            {/* Hover/focus label — solid strip pinned to the BOTTOM of
                the circle so the text always reads cleanly regardless of
                what the avatar photo looks like. Default state is
                invisible; pointer-events on the button stay active so
                the click target is the whole circle, not just the strip. */}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:opacity-100"
              style={{
                background: "rgb(var(--bcc-black-rgb) / 0.72)",
                color: "var(--bcc-white)",
                paddingTop: "5px",
                paddingBottom: "5px",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: "8.5px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {activeUpload.isPending ? "UPLOADING…" : "UPDATE"}
            </span>
          </button>
          </>
        )}
      </div>

      {/* Remove affordance — page cards only, shown when an image is set
          and the viewer can edit. Sits just outside the circle's top-right
          so it never collides with the bottom UPDATE strip. */}
      {canRemoveImage && (
        <button
          type="button"
          onClick={handleRemove}
          aria-label="Remove page image"
          disabled={pageDelete.isPending || activeUpload.isPending}
          // z-[11]: one above the UPDATE circle so REMOVE stays clickable
          // where the two overlap, and above the z-5 nav overlay.
          className="bcc-mono absolute right-0 top-1 z-[11] cursor-pointer rounded-full px-2 py-0.5 opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bcc-accent)] disabled:cursor-wait group-hover:opacity-100"
          style={{
            fontSize: "8.5px",
            letterSpacing: "0.14em",
            background: "rgb(var(--bcc-black-rgb) / 0.72)",
            color: "var(--bcc-white)",
          }}
        >
          {pageDelete.isPending ? "REMOVING…" : "REMOVE"}
        </button>
      )}

      {/* Inline error surface — sits below the hex when the upload OR
          remove mutation fails. Quiet mono, doesn't break the card
          layout. */}
      {canEditAvatar && (activeUpload.isError || pageDelete.isError) && (
        <span
          role="alert"
          className="bcc-mono absolute left-1/2 z-[5] -translate-x-1/2 whitespace-nowrap"
          style={{
            bottom: "-18px",
            fontSize: "9px",
            letterSpacing: "0.16em",
            color: "var(--bcc-danger)",
          }}
        >
          {pageDelete.isError ? "REMOVE FAILED" : "UPLOAD FAILED"}
        </span>
      )}
    </div>
  );
}
