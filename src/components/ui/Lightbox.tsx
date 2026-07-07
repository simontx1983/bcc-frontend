"use client";

/**
 * Lightbox — full-screen in-app image viewer for feed media (photo/gif).
 * Built on the shared `Dialog` primitive, so ESC/backdrop-click/body-
 * scroll-lock come for free; this just supplies a full-bleed, centered
 * image layout instead of a panel.
 */

import { Dialog } from "@/components/ui/Dialog";

export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={alt !== "" ? alt : "Image"}
      bare
      center
      onClose={onClose}
      panelClassName="flex h-full max-h-none w-full max-w-none items-center justify-center"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="bcc-mono absolute right-4 top-4 z-10 text-[10px] tracking-[0.24em] text-cardstock-deep hover:text-ink"
      >
        ESC
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote feed media, no per-tenant remotePatterns allow-list */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
      />
    </Dialog>
  );
}
