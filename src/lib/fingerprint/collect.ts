/**
 * §V1.5 — device fingerprint collection for fraud detection.
 *
 * What this is:
 *   The headless counterpart to bcc-trust/assets/js/fingerprint.js.
 *   Collects cheap browser signals + serializes them into a JSON blob
 *   and a SHA-256 hex hash. Posts to /bcc-trust/v1/device-fingerprint
 *   exactly once per session (sessionStorage gate in the reporter hook).
 *
 * What this is NOT:
 *   The "identity" used for shared-device detection. Per the controller
 *   comment in UserStatusController::store_fingerprint, the server
 *   computes its own server-side fingerprint (IP + UA + WP salt) and
 *   uses that as the identity bucket. The client hash here is kept for
 *   correlation in automation_signals — i.e. detecting when the same
 *   account's client hash mysteriously rotates between sessions
 *   (sock-puppet behavior).
 *
 * Scope cuts vs the legacy collector:
 *   - No canvas fingerprint (slow + weak in modern browsers w/ tracking
 *     protection; ~80% noise in our context)
 *   - No audio fingerprint (Safari blocks it without user gesture)
 *   - No font enumeration (300+ probes; flags as fingerprinting in
 *     privacy tools)
 *   These can come back as V2 work if fraud volume warrants it.
 *
 * Hash format: lowercase SHA-256 hex, 64 chars — fits the server's
 * 32-128 hex regex.
 */

interface FingerprintData {
  /** Lowercase user agent. */
  ua: string;
  /** navigator.platform — coarse OS hint. */
  platform: string;
  /** Browser language tag (e.g. "en-US"). */
  language: string;
  /** All preferred languages, comma-joined. */
  languages: string;
  /** Resolved IANA timezone (e.g. "America/New_York"). */
  timezone: string;
  /** Minutes offset from UTC. */
  timezone_offset: number;
  /** screen.width × screen.height. */
  screen: string;
  /** screen.colorDepth. */
  color_depth: number;
  /** window.devicePixelRatio. */
  dpr: number;
  /** navigator.hardwareConcurrency (cpu cores hint). */
  cpu_cores: number;
  /** navigator.deviceMemory (gb hint, only Chromium reports this). */
  device_memory: number;
  /** Touch-points supported (mobile/tablet hint). */
  max_touch: number;
  /** True when window.chrome is present (Chromium-family). */
  is_chromium: boolean;
  /** navigator.webdriver — automation tooling flag. */
  webdriver: boolean;
  /** True when window.outerHeight is 0 (headless tell). */
  outer_zero: boolean;
}

export interface FingerprintPayload {
  fingerprint: { hash: string };
  data: FingerprintData;
}

/**
 * Collect signals from the current browser and return a hashable payload.
 * Caller decides what to do with it (post to /device-fingerprint).
 */
export async function collectFingerprint(): Promise<FingerprintPayload> {
  if (typeof window === "undefined") {
    throw new Error("collectFingerprint must run in the browser");
  }

  const data = collectData();
  const hash = await hashData(data);

  return {
    fingerprint: { hash },
    data,
  };
}

function collectData(): FingerprintData {
  const nav = window.navigator;

  return {
    ua: nav.userAgent.toLowerCase(),
    platform: nav.platform,
    language: nav.language,
    languages: Array.isArray(nav.languages) ? nav.languages.join(",") : "",
    timezone: resolveTimezone(),
    timezone_offset: new Date().getTimezoneOffset(),
    screen: `${window.screen.width}x${window.screen.height}`,
    color_depth: window.screen.colorDepth,
    dpr: typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1,
    cpu_cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 0,
    device_memory: typeof (nav as unknown as { deviceMemory?: number }).deviceMemory === "number"
      ? (nav as unknown as { deviceMemory: number }).deviceMemory
      : 0,
    max_touch: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : 0,
    is_chromium: typeof (window as { chrome?: unknown }).chrome !== "undefined",
    webdriver: nav.webdriver === true,
    outer_zero: window.outerHeight === 0,
  };
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/**
 * SHA-256 hex of the data object's stable JSON representation. Web
 * Crypto is available in every modern browser + Node 16+, so no polyfill.
 */
async function hashData(data: FingerprintData): Promise<string> {
  const json = stableStringify(data);
  const buffer = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Stable JSON: sort keys so the same data always produces the same hash
 * regardless of property insertion order. (Object.keys() order is
 * insertion-order today but specifying still future-proofs the contract.)
 */
function stableStringify(value: FingerprintData): string {
  const keys = Object.keys(value).sort() as Array<keyof FingerprintData>;
  const ordered: Record<string, unknown> = {};
  for (const key of keys) {
    ordered[key] = value[key];
  }
  return JSON.stringify(ordered);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
