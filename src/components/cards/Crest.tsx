"use client";

/**
 * Crest — three concentric hex layers (outer cardstock ring, mid
 * chain-color stroke, inner cardstock-deep fill) with either a
 * stencil monogram or the operator's avatar at the center.
 *
 * Extracted from CardFactory.tsx (Phase 3.3 god-component split);
 * markup and behavior unchanged.
 *
 * Avatar treatment: the photo is hex-clipped and inset slightly
 * inside the inner ring so the cardstock-deep layer stays visible as
 * a frame. A subtle saturation drop + chain-color multiply overlay
 * gives portraits a "factory ID" feel rather than an Instagram crop,
 * keeping photos cohesive with the warehouse-stencil aesthetic.
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
  const { initials, monogram_color: monogramColor, image_url: imageUrl } =
    card.crest;
  const hexClip = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

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
    <div className="group bcc-hex h-[160px] w-[140px] drop-shadow-[0_6px_8px_rgb(var(--bcc-black-rgb)_/_0.5)]">
      <span aria-hidden className="bcc-hex-outer" />
      <span aria-hidden className="bcc-hex-mid" />
      <span aria-hidden className="bcc-hex-inner" />

      {hasImage ? (
        <>
          {/* Avatar wrapper — Tailwind's preflight sets
              `img { max-width: 100%; height: auto }` which overrides
              CSS's absolute-position sizing for replaced elements
              (image rendered at 140×140 instead of 112×132 from a
              500×500 source). Putting the `<img>` inside an absolutely-
              positioned div lets the div take the inset-derived size
              and the img fill it via `w-full h-full`. */}
          <div
            className="absolute"
            style={{
              top: "14px",
              right: "14px",
              bottom: "14px",
              left: "14px",
              clipPath: hexClip,
              zIndex: 2,
            }}
          >
            {isWpMediaUrl(imageUrl) ? (
              <Image
                src={imageUrl}
                alt=""
                fill
                sizes="112px"
                className="object-cover"
                style={{
                  filter: "saturate(0.92) contrast(1.02)",
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- non-WP host (page-card art can be NFT/IPFS) — outside the next/image allowlist; see lib/media.ts
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                style={{
                  filter: "saturate(0.92) contrast(1.02)",
                }}
              />
            )}
          </div>
          {/* Chain-color multiply overlay — subtle brand tie-in only.
              Matches the avatar's hex shape so the tint stays inside
              the photo and doesn't bleed onto the chain ring. */}
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              top: "14px",
              right: "14px",
              bottom: "14px",
              left: "14px",
              clipPath: hexClip,
              background: "var(--bcc-chain-color, var(--chain-cosmos))",
              mixBlendMode: "multiply",
              opacity: 0.08,
              zIndex: 3,
            }}
          />
        </>
      ) : (
        <span
          className="bcc-stencil relative z-[2] text-5xl"
          style={{ color: monogramColor }}
        >
          {initials}
        </span>
      )}

      {/* Owner upload affordance — sits in the same hex-clipped region
          as the avatar. Default state is invisible (pointer events
          enabled so the click target is still active); hover/focus
          reveals an ink-deep scrim + UPDATE AVATAR label. The hidden
          file input is anchored next to the button so the picker
          opens from inside the card without a separate modal. */}
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
            className="group absolute z-[4] cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-safety disabled:cursor-wait"
            style={{
              top: "14px",
              right: "14px",
              bottom: "14px",
              left: "14px",
              clipPath: hexClip,
            }}
          >
            {/* Hover/focus label — solid grey strip pinned to the
                BOTTOM of the hex region so the text always reads
                cleanly regardless of what the avatar photo looks like.
                Default state is invisible; pointer-events on the
                button stay active so the click target is the whole
                hex, not just the strip. */}
            <span
              aria-hidden
              className="absolute inset-x-0 flex items-center justify-center bg-cardstock-edge text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:opacity-100"
              style={{
                bottom: "16px",
                paddingTop: "6px",
                paddingBottom: "6px",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: "10px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {activeUpload.isPending ? "UPLOADING…" : "UPDATE AVATAR"}
            </span>
          </button>
        </>
      )}

      {/* Remove affordance — page cards only, shown when an image is set
          and the viewer can edit. Pinned to the top-right corner of the
          hex so it doesn't collide with the bottom UPDATE AVATAR strip.
          stopPropagation keeps the card from flipping on click. */}
      {canRemoveImage && (
        <button
          type="button"
          onClick={handleRemove}
          aria-label="Remove page image"
          disabled={pageDelete.isPending || activeUpload.isPending}
          className="bcc-mono absolute right-1 top-1 z-[5] cursor-pointer border border-safety/70 bg-ink/80 px-2 py-0.5 text-cardstock opacity-0 backdrop-blur transition-opacity hover:bg-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety disabled:cursor-wait group-hover:opacity-100"
          style={{ fontSize: "9px", letterSpacing: "0.16em" }}
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
          className="bcc-mono absolute left-1/2 z-[5] -translate-x-1/2 whitespace-nowrap text-safety"
          style={{
            bottom: "-18px",
            fontSize: "10px",
            letterSpacing: "0.18em",
          }}
        >
          {pageDelete.isError ? "REMOVE FAILED" : "UPLOAD FAILED"}
        </span>
      )}
    </div>
  );
}
