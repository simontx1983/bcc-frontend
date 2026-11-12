"use client";

/**
 * FallbackImg — a plain `<img>` that walks a server-provided fallback chain.
 *
 * Contract §3.7 IPFS image rule (F-165), the client rule for NFT images:
 *   1. render `src` (the image on the site's configured IPFS gateway, or
 *      any other https image);
 *   2. on the first load error, switch to `fallbackSrc` when it is
 *      non-null (the public ipfs.io copy of the same IPFS image);
 *   3. on the next error, render the caller's `placeholder`.
 * No `next/image` proxy and no key ever added to the URL: both URLs are
 * rendered exactly as the server sent them.
 *
 * `crossOrigin="anonymous"` — DELIBERATE DEVIATION from the plain client
 * rule. It is set only when `fallbackSrc` is non-null, which the server
 * only does for IPFS images (gateway + ipfs.io, both of which send
 * `Access-Control-Allow-Origin`). Setting it unconditionally would make
 * the browser refuse every non-IPFS NFT image whose host sends no CORS
 * headers — a regression on surfaces that work today.
 *
 * Errors before hydration: the `<img>` is server-rendered, so a fast
 * failure can fire before React attaches `onError`. On mount (and on each
 * new URL) an element that is `complete` with `naturalWidth === 0` is
 * confirmed with `decode()`; a rejection counts as an error.
 *
 * Failed URLs are remembered by value, so a change of `src` / `fallbackSrc`
 * (same component instance, new item) starts the chain again with no reset
 * effect.
 */

import {
  type ImgHTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface FallbackImgProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError" | "crossOrigin"> {
  /** Primary URL as sent by the server. Null / "" skips straight on. */
  src: string | null | undefined;
  /** Server-provided fallback (`image_fallback_url`); null when none. */
  fallbackSrc?: string | null | undefined;
  /** Rendered once every URL in the chain has failed (or none exists). */
  placeholder?: ReactNode;
}

function usable(url: string | null | undefined): url is string {
  return typeof url === "string" && url !== "";
}

export function FallbackImg({
  src,
  fallbackSrc,
  placeholder = null,
  alt = "",
  ...imgProps
}: FallbackImgProps) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const chain: string[] = [];
  if (usable(src)) chain.push(src);
  if (usable(fallbackSrc) && fallbackSrc !== src) chain.push(fallbackSrc);
  const current = chain.find((url) => !failed.includes(url)) ?? null;
  const corsSafe = usable(fallbackSrc);

  const markFailed = useCallback((url: string) => {
    setFailed((prev) => (prev.includes(url) ? prev : [...prev, url]));
  }, []);

  const onError = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      // Read the URL the element actually tried, not a closure value, so a
      // late error from a previous URL cannot fail the current one.
      const tried = event.currentTarget.getAttribute("src");
      if (tried !== null) markFailed(tried);
    },
    [markFailed],
  );

  useEffect(() => {
    const img = imgRef.current;
    if (img === null || current === null) return;
    if (!img.complete || img.naturalWidth !== 0) return;
    // Without decode() a failure cannot be told apart from an SVG with no
    // intrinsic size, so do nothing: the onError handler still covers
    // every failure after hydration.
    if (typeof img.decode !== "function") return;
    // `naturalWidth === 0` alone is not proof: an SVG with no intrinsic
    // size reports it too. `decode()` rejects only for a broken image.
    let cancelled = false;
    img.decode().catch(() => {
      if (!cancelled) markFailed(current);
    });
    return () => {
      cancelled = true;
    };
  }, [current, markFailed]);

  if (current === null) {
    return <>{placeholder}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote NFT/IPFS URLs rendered verbatim per the F-165 contract; no next/image proxy
    <img
      {...imgProps}
      ref={imgRef}
      src={current}
      alt={alt}
      onError={onError}
      {...(corsSafe ? { crossOrigin: "anonymous" as const } : {})}
    />
  );
}
