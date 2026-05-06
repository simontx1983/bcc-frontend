"use client";

/**
 * Cover art for a community discovery card. Server-rendered initial
 * paint is fine; the `"use client"` boundary exists only to handle
 * <img> onError → fallback to the initials block, so a single 404 from
 * a remote NFT thumbnail doesn't leave a broken-image icon on the card.
 *
 * The InitialsBlock is also used directly when the backend returns no
 * image_url (V1: non-NFT kinds always; NFT kinds when the underlying
 * collection has no image).
 */

import { useEffect, useRef, useState } from "react";

interface CommunityCoverProps {
  imageUrl: string | null;
  /** Group/community name. Used to derive the initials when no image. */
  name: string;
  /** Stable identifier — drives the deterministic initials-block hue. */
  groupId: number;
}

export function CommunityCover({ imageUrl, name, groupId }: CommunityCoverProps) {
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Three failure modes we treat the same way (fall back to initials):
  //   1. Network/HTTP error (404, CORS, DNS) — fires `error`.
  //   2. 200 OK with zero-byte body or malformed image — fires `load`
  //      but naturalWidth/Height stay 0. Caught in onLoad below.
  //   3. Cached failed response — neither `error` nor `load` fires
  //      reliably because the browser completed the load before React
  //      attached the handler. Caught by the post-mount useEffect.
  useEffect(() => {
    setErrored(false);
    const img = imgRef.current;
    if (img === null) return;
    if (img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
      setErrored(true);
    }
  }, [imageUrl]);

  const haveImage = imageUrl !== null && imageUrl !== "" && !errored;

  if (haveImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- collection art is a remote NFT thumbnail; we haven't taken on a domain allowlist for next/image
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        onError={() => setErrored(true)}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            setErrored(true);
          }
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return <InitialsBlock name={name} groupId={groupId} />;
}

function InitialsBlock({ name, groupId }: { name: string; groupId: number }) {
  // Multiplying by a prime + mod 360 gives an even-feeling hue spread
  // across consecutive group_ids. Saturation/lightness tuned to feel
  // on-brand against the cream/ink palette without clashing with the
  // safety/blueprint accent colors.
  const hue = (groupId * 47) % 360;
  const initials = (() => {
    const stripped = name.replace(/^Holders:\s*/i, "").trim();
    const parts = stripped.split(/\s+/).filter(Boolean);
    const first = parts[0] ?? "";
    const second = parts[1] ?? "";
    if (first === "") return "??";
    if (second === "") return first.slice(0, 2).toUpperCase();
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  })();

  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor: `hsl(${hue}, 32%, 40%)` }}
    >
      <span className="bcc-stencil text-5xl text-cardstock/90">{initials}</span>
    </div>
  );
}
