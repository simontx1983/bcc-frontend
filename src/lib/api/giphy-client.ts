/**
 * Typed Giphy REST client — search + trending only.
 *
 * Hits Giphy's API directly from the browser using the public API key
 * surfaced by /integrations/giphy. Giphy designs these "browser SDK"
 * keys for client-side use (rate-limited per IP); the key isn't a
 * secret in the cryptographic sense, just an admin-configured
 * identifier.
 *
 * We deliberately narrow Giphy's full response shape down to
 * `GiphySearchResult` (id + url + preview_url + width + height +
 * title) — the picker doesn't need the rest of Giphy's metadata
 * (user, tags, slug, source, embed_url, etc.) and exposing it would
 * couple BCC to provider-specific shapes.
 *
 * Provider-specific URL choice:
 *   - For the picker grid we use `images.fixed_height_small.url` —
 *     Giphy's smallest fixed-height variant, ~100px tall, fastest
 *     loading. Saves bandwidth for users browsing 25+ trending GIFs.
 *   - For the rendered card (the URL we persist) we use
 *     `images.original.url` — full quality. The submitted GIF should
 *     look as the user picked it, not a thumbnail.
 */

import type { GiphySearchResult } from "@/lib/api/types";

const GIPHY_BASE_URL = "https://api.giphy.com/v1/gifs";

interface GiphyApiImage {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyApiGif {
  id?: string;
  title?: string;
  images?: {
    original?: GiphyApiImage;
    fixed_height_small?: GiphyApiImage;
    fixed_height?: GiphyApiImage;
  };
}

interface GiphyApiResponse {
  data?: GiphyApiGif[];
}

interface GiphyParams {
  apiKey: string;
  rating: string;
  limit: number;
  signal: AbortSignal | undefined;
}

export async function giphyTrending(
  params: GiphyParams
): Promise<GiphySearchResult[]> {
  const { apiKey, rating, limit, signal } = params;
  const search = new URLSearchParams({
    api_key: apiKey,
    limit:   String(Math.max(1, Math.min(limit, 50))),
    rating,
    bundle:  "messaging_non_clips",
  });
  return fetchAndNormalize(`${GIPHY_BASE_URL}/trending?${search.toString()}`, signal);
}

export async function giphySearch(
  query: string,
  params: GiphyParams
): Promise<GiphySearchResult[]> {
  const trimmed = query.trim();
  if (trimmed === "") {
    return giphyTrending(params);
  }
  const { apiKey, rating, limit, signal } = params;
  const search = new URLSearchParams({
    api_key: apiKey,
    q:       trimmed,
    limit:   String(Math.max(1, Math.min(limit, 50))),
    rating,
    bundle:  "messaging_non_clips",
    lang:    "en",
  });
  return fetchAndNormalize(`${GIPHY_BASE_URL}/search?${search.toString()}`, signal);
}

async function fetchAndNormalize(
  url: string,
  signal: AbortSignal | undefined
): Promise<GiphySearchResult[]> {
  const init: RequestInit = {
    method: "GET",
    headers: { Accept: "application/json" },
  };
  // exactOptionalPropertyTypes — only include the signal when defined.
  if (signal !== undefined) {
    init.signal = signal;
  }
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Giphy API ${response.status}`);
  }
  const json = (await response.json()) as GiphyApiResponse;
  if (!Array.isArray(json.data)) {
    return [];
  }

  const out: GiphySearchResult[] = [];
  for (const gif of json.data) {
    const id = typeof gif.id === "string" ? gif.id : "";
    const original = gif.images?.original;
    const preview  = gif.images?.fixed_height_small ?? gif.images?.fixed_height;
    const url      = typeof original?.url === "string" ? original.url : "";
    const previewUrl = typeof preview?.url === "string" ? preview.url : url;
    if (id === "" || url === "") continue;
    out.push({
      id,
      url,
      preview_url: previewUrl,
      width:  parseDimension(original?.width),
      height: parseDimension(original?.height),
      title:  typeof gif.title === "string" ? gif.title : "",
    });
  }
  return out;
}

function parseDimension(value: string | undefined): number {
  if (typeof value !== "string") return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
