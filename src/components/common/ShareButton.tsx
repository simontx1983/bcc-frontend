"use client";

/**
 * ShareButton — native external sharing for any PUBLIC page (member
 * profiles /u/[handle], entity pages /v /p /c, …).
 *
 * Generalized from the original member-only ShareProfileButton: it now
 * takes a `path` (app-relative, e.g. "/v/coinbase01-cosmos") plus a
 * `title`, so the same component drives every shareable surface. Member
 * profile and entity pages both mount THIS one component — there is no
 * forked copy.
 *
 * Public surfaces have no permission gate: any viewer can share. This is
 * OUR sharing surface — PeepSo owns post / repost sharing through its own
 * templates, which this Next.js app does not render, so none of it
 * surfaces here.
 *
 * Degradation:
 *   - If `navigator.share` exists (mobile / supported browsers), the
 *     button opens the OS share sheet directly. No menu.
 *   - Otherwise it toggles a small dropdown (matching the SiteHeader
 *     dropdown pattern: outside-click + Esc dismiss, role="menu") with
 *     Copy link + X / Facebook / LinkedIn intent links. These mirror
 *     PeepSo's provider set.
 *
 * No business logic, no raw fetch, no `as any`. The shareable URL is
 * built from `window.location.origin` + the supplied `path` on the
 * client so it's always the app's real origin without threading an env
 * var into the bundle.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface ShareButtonProps {
  /**
   * App-relative path to share (leading slash, no origin), e.g.
   * "/u/phillipcosmos" or "/v/coinbase01-cosmos". The origin is
   * resolved client-side at click time.
   */
  path: string;
  /** Already-presented display name, used as the share-sheet title. */
  title: string;
  /**
   * Accessible label for the trigger button. Defaults to a generic
   * "Share this page" — callers pass a more specific label (e.g.
   * "Share Phillip's profile") when they have one.
   */
  ariaLabel?: string;
}

/** Detect the Web Share API without tripping `any`. */
function canUseNativeShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

export function ShareButton({ path, title, ariaLabel }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);

  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const label = ariaLabel ?? "Share this page";

  // Resolve native-share availability after hydration so SSR + first
  // paint always render the fallback-capable button (no hydration drift).
  useEffect(() => {
    setNativeShare(canUseNativeShare());
  }, []);

  const shareUrl = useCallback((): string => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    // `path` is already an app route (e.g. "/v/<slug>"); only the origin
    // is resolved client-side. Slug encoding is the caller's job.
    return `${origin}${path}`;
  }, [path]);

  const shareTitle = `${title} on the Floor`;

  // ── Outside-click + Esc dismiss (mirrors SiteHeader's useModalDismiss).
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        anchorRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const onPrimaryClick = useCallback(() => {
    const url = shareUrl();
    if (canUseNativeShare()) {
      // Web Share rejects on user-cancel; swallow — it's not an error.
      void navigator.share({ title: shareTitle, url }).catch(() => {});
      return;
    }
    setOpen((v) => !v);
  }, [shareUrl, shareTitle]);

  const onCopy = useCallback(() => {
    const url = shareUrl();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        })
        .catch(() => {});
    }
  }, [shareUrl]);

  // Social intent URLs — encoded share URL. Mirrors PeepSo's provider
  // intents (X / Facebook / LinkedIn). Computed at click time so the
  // origin is resolved client-side.
  const intents: Array<{ label: string; build: (u: string) => string }> = [
    {
      label: "Share to X",
      build: (u) => `https://x.com/share?url=${encodeURIComponent(u)}`,
    },
    {
      label: "Facebook",
      build: (u) =>
        `https://www.facebook.com/sharer.php?u=${encodeURIComponent(u)}`,
    },
    {
      label: "LinkedIn",
      build: (u) =>
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
    },
  ];

  const menuItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    width: "100%",
    boxSizing: "border-box",
    borderRadius: "var(--bcc-radius-md)",
    textDecoration: "none",
    color: "var(--bcc-text-secondary)",
    fontSize: 13,
    fontFamily: "var(--font-serif), Georgia, serif",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    transition: reducedMotion ? "none" : "background 120ms ease",
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={anchorRef}
        type="button"
        className="bcc-btn bcc-btn-ghost"
        aria-label={label}
        {...(!nativeShare
          ? { "aria-haspopup": "menu" as const, "aria-expanded": open }
          : {})}
        onClick={onPrimaryClick}
      >
        <ShareIcon />
        <span>Share</span>
      </button>

      {!nativeShare && open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="bcc-header-modal"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 220,
            borderRadius: "var(--bcc-radius-lg)",
            padding: 8,
            zIndex: 300,
            ...(reducedMotion
              ? {}
              : { animation: "bcc-fade-in 0.15s ease forwards" }),
          }}
        >
          <button
            type="button"
            role="menuitem"
            style={menuItemStyle}
            onClick={onCopy}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--bcc-surface-hover, rgb(var(--bcc-white-rgb) / 0.06))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <LinkIcon />
            {copied ? "Copied!" : "Copy link"}
          </button>

          {intents.map((intent) => (
            <a
              key={intent.label}
              role="menuitem"
              href={intent.build(shareUrl())}
              target="_blank"
              rel="noopener noreferrer"
              style={menuItemStyle}
              onClick={() => setOpen(false)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--bcc-surface-hover, rgb(var(--bcc-white-rgb) / 0.06))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
              }}
            >
              <ExternalIcon />
              {intent.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="12.5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3.5" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12.5" cy="12.5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.3 7l5.4-2.7M5.3 9l5.4 2.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.5 9.5l3-3M7 4l.7-.7a2.5 2.5 0 113.5 3.5l-.7.7M9 12l-.7.7a2.5 2.5 0 11-3.5-3.5l.7-.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9 3h4v4M13 3l-6 6M11 9.5V12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
