"use client";

/**
 * NewPostTrigger — shared "+ New Post" button for LeftSidebar + the
 * mobile bottom-nav center button.
 *
 * Authenticated: opens the same v1.5 inline Composer card (already
 * expanded) inside the shared Dialog, in `bare` + `center` mode so the
 * Dialog doesn't double-wrap the composer's own bcc-panel and the card
 * is centered on every breakpoint (not the bottom-sheet idiom other
 * Dialogs use). Glassy scrim, opaque composer panel — see Dialog's
 * existing bg-ink/70 + backdrop-blur-sm backdrop.
 *
 * Anonymous: redirects to /login with a callbackUrl back to the home
 * page's `?compose=1` deep link. Sign-in honors callbackUrl, so a
 * returning member lands back on the Floor with the composer already
 * expanded. Sign-up does NOT thread callbackUrl through (it hardcodes
 * verify-email -> onboarding -> "/") — so a brand-new member just sees
 * a plain Floor after onboarding, not a composer popping up right as
 * they arrive. That split is intentional, not an oversight.
 *
 * Only `viewerHandle` is available here (from the session) — no avatar
 * image, display name, or rank, same degraded-identity fallback the
 * inline composer already uses for bare-mount call sites (ActivityPanel).
 */

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Composer } from "@/components/composer/Composer";
import { Dialog } from "@/components/ui/Dialog";

interface NewPostTriggerProps {
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  title?: string;
  children: React.ReactNode;
}

export function NewPostTrigger({ className, style, ariaLabel, title, children }: NewPostTriggerProps) {
  const { data: session } = useSession();
  const viewerHandle = session?.user?.handle;
  const [open, setOpen] = useState(false);

  if (viewerHandle === undefined) {
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent("/?compose=1")}`}
        className={className}
        style={style}
        aria-label={ariaLabel}
        title={title}
        data-bcc-tour="composer.trigger"
      >
        {children}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        style={style}
        aria-label={ariaLabel}
        title={title}
        data-bcc-tour="composer.trigger"
      >
        {children}
      </button>
      {open && (
        <Dialog title="Compose a post" onClose={() => setOpen(false)} bare center panelClassName="max-w-2xl">
          <Composer
            variant="inline"
            startExpanded
            hosted
            onClose={() => setOpen(false)}
            viewerHandle={viewerHandle}
          />
        </Dialog>
      )}
    </>
  );
}
