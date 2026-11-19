"use client";

/**
 * Cloudflare Turnstile, rendered explicitly for the /auth/login captcha
 * step-up (lib/auth/login-captcha). Mounted only once the server has asked
 * for it (429 bcc_captcha_required), so the script is never loaded on a
 * normal sign-in.
 *
 * - The script loads once per page (a shared promise); a failed load can be
 *   retried, and says so rather than leaving an empty box.
 * - The widget is always rendered with `action: "login"`, which SA1's
 *   backend follow-up will require in the siteverify reply.
 * - It follows the site theme (html[data-theme]), re-rendering on a toggle.
 * - `resetSignal` resets the rendered widget (a spent or rejected token);
 *   unmounting removes it.
 * - The token reaches the page through `onToken`; `onExpire` / `onFail`
 *   tell it the token it holds is no longer usable.
 *
 * CSP: https://challenges.cloudflare.com is allowed in script-src and
 * frame-src (lib/security-headers).
 */

import { useEffect, useRef, useState } from "react";

import { TURNSTILE_LOGIN_ACTION, TURNSTILE_SCRIPT_SRC } from "@/lib/auth/login-captcha";

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  theme: "light" | "dark" | "auto";
  size: "normal" | "flexible" | "compact";
  language: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

export interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<TurnstileApi> | null = null;

/** Load api.js once; a failure clears the cache so a retry can load again. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile !== undefined) return Promise.resolve(window.turnstile);
  if (scriptLoad !== null) return scriptLoad;
  const script = document.createElement("script");
  scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile !== undefined) resolve(window.turnstile);
      else reject(new Error("turnstile_unavailable"));
    };
    script.onerror = () => reject(new Error("turnstile_unavailable"));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    scriptLoad = null;
    script.remove();
    throw err;
  });
  return scriptLoad;
}

type WidgetTheme = "light" | "dark" | "auto";

/** Match the site's theme (html[data-theme]); otherwise follow the OS. */
function widgetTheme(): WidgetTheme {
  if (typeof document === "undefined") return "auto";
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "light" || theme === "dark" ? theme : "auto";
}

/**
 * The site theme, live. Turnstile cannot restyle a rendered widget, so a
 * toggle (the auth card has one) re-renders it with the new theme.
 */
function useWidgetTheme(): WidgetTheme {
  const [theme, setTheme] = useState<WidgetTheme>(widgetTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(widgetTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function TurnstileWidget({
  siteKey,
  resetSignal,
  onToken,
  onExpire,
  onFail,
}: {
  siteKey: string;
  /** Bump to reset the rendered widget (its token was spent or rejected). */
  resetSignal: number;
  onToken: (token: string) => void;
  onExpire: () => void;
  onFail: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const theme = useWidgetTheme();

  // The latest callbacks, so a parent re-render never re-renders the widget.
  const handlers = useRef({ onToken, onExpire, onFail });
  useEffect(() => {
    handlers.current = { onToken, onExpire, onFail };
  });

  // Runs with the container mounted: a retry clears loadFailed in the same
  // update that bumps `attempt` (below).
  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        if (cancelled || container.current === null) return;
        widgetId.current =
          api.render(container.current, {
            sitekey: siteKey,
            action: TURNSTILE_LOGIN_ACTION,
            theme,
            size: "flexible",
            language: "auto",
            callback: (token) => handlers.current.onToken(token),
            "expired-callback": () => handlers.current.onExpire(),
            "error-callback": () => handlers.current.onFail(),
          }) ?? null;
      },
      () => {
        if (cancelled) return;
        setLoadFailed(true);
        handlers.current.onFail();
      },
    );
    return () => {
      cancelled = true;
      if (widgetId.current !== null) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey, attempt, theme]);

  useEffect(() => {
    if (resetSignal === 0 || widgetId.current === null) return;
    window.turnstile?.reset(widgetId.current);
  }, [resetSignal]);

  if (loadFailed) {
    return (
      <div role="alert" className="bcc-auth-hint bcc-auth-hint--error">
        <p style={{ margin: 0 }}>
          The verification check didn&rsquo;t load. Check your connection, or allow
          challenges.cloudflare.com if you use a content blocker.
        </p>
        <button
          type="button"
          className="bcc-auth-submit bcc-auth-submit--outline"
          style={{ marginTop: "8px", minHeight: "44px" }}
          onClick={() => {
            setLoadFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return <div ref={container} data-testid="turnstile-container" style={{ minHeight: "65px" }} />;
}
