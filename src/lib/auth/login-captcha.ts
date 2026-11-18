/**
 * The captcha step-up on POST /auth/login (contract v1.161; bcc-trust #715).
 *
 * Off until the server has Cloudflare Turnstile keys. While it is on, a
 * sign-in without a valid token answers `429 bcc_captcha_required` with
 * `error.data.captcha = { provider: "turnstile", site_key }`. The client
 * renders the widget with that site key and re-submits the same body plus
 * `captcha_token` (single-use, about 5 minutes). A rejected or expired
 * token answers `bcc_captcha_required` again: reset the widget.
 *
 * The backend checks the siteverify reply's `action`, so the widget is
 * always rendered with TURNSTILE_LOGIN_ACTION.
 */

import { isCode } from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";

export const CAPTCHA_REQUIRED_CODE = "bcc_captcha_required";

/** The action the backend requires in the siteverify reply. */
export const TURNSTILE_LOGIN_ACTION = "login";

/** Explicit rendering: the page decides when (and whether) a widget exists. */
export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface LoginCaptchaChallenge {
  provider: "turnstile";
  siteKey: string;
}

/**
 * The challenge a `bcc_captcha_required` error carries, or null.
 *
 * Null for any other error, and for a challenge this client cannot render
 * (an unknown provider, a missing or empty site key) — the caller then
 * shows plain copy instead of a widget.
 */
export function loginCaptchaChallenge(err: unknown): LoginCaptchaChallenge | null {
  if (!isCode(err, CAPTCHA_REQUIRED_CODE) || !(err instanceof BccApiError)) return null;
  const captcha = err.data?.["captcha"];
  if (typeof captcha !== "object" || captcha === null) return null;
  const { provider, site_key: siteKey } = captcha as Record<string, unknown>;
  if (provider !== "turnstile") return null;
  if (typeof siteKey !== "string" || siteKey.trim() === "") return null;
  return { provider, siteKey };
}
