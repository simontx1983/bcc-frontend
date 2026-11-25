"use client";

/**
 * F-582: a suspended member is told so, calmly, for as long as the session
 * says so (contract v1.136, F-305: a suspended member signs in READ-ONLY;
 * the server refuses every write with "Your account is suspended.").
 *
 * A compact panel in the shared bottom slot (above the mobile nav, stacked
 * with any toast), so it works in every (main) layout without touching the
 * chrome. It is not dismissable: it lasts while the suspension does. One
 * line, plus a "What you can still do" disclosure listing what the contract
 * allows while suspended. No dates, no nudge.
 *
 * Where the flag comes from: sign-in (every auth response carries it), and
 * a server re-read of GET /auth/session the client only ASKS for
 * (`refreshStanding`) — the client never supplies the value. It asks at most
 * once per bearer in a page load: when the standing is unknown (a session
 * from before the field) and after a refresh replaced the bearer (so a
 * lifted suspension clears). A failed read changes nothing, so an unknown
 * standing stays unknown and shows nothing; there is no retry loop.
 */

import { useSession } from "next-auth/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { BottomSlot } from "@/components/ui/BottomSlot";
import { sessionSuspended } from "@/lib/auth/auth-flags";

/**
 * The panel is fixed and persistent, so the scroll areas reserve its height
 * (globals.css reads `--bcc-bottom-reserve`): the last content on a page,
 * a pager or a button, can always scroll clear of it.
 */
export const BOTTOM_RESERVE_VAR = "--bcc-bottom-reserve";
/** The slot's gap above the panel's own height. */
const RESERVE_GAP_PX = 16;

/** Bearers (by expiry) whose standing this page load has already asked about. */
const askedForBearer = new Set<string>();

/** Test seam: forget what this page load asked (module state outlives a test). */
export function resetSuspendedNoticeAsks(): void {
  askedForBearer.clear();
}

export const SUSPENDED_NOTICE_LINE = "Your account is read-only for now.";
export const SUSPENDED_NOTICE_DETAILS =
  "Your account is suspended, so it's read-only for now. You can still read and browse, change your password, privacy and notification settings, manage who you've blocked, and appeal a finding against you.";

export function SuspendedNotice() {
  const { data: session, status, update } = useSession();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const detailsId = useId();
  const firstBearer = useRef<string | null>(null);
  // State, not a ref: BottomSlot portals its content only after it mounts,
  // so the panel element arrives a render later than this component, and
  // the reserve must be measured (and observed) once it exists.
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const suspended = sessionSuspended(session);

  useEffect(() => {
    if (status !== "authenticated" || session === null) return;
    const bearer = String(session.bccTokenExpiresAt ?? "");
    if (firstBearer.current === null) firstBearer.current = bearer;
    const unknown = session.user?.suspended === undefined;
    const refreshedHere = bearer !== firstBearer.current;
    if (!unknown && !refreshedHere) return;
    if (askedForBearer.has(bearer)) return;
    askedForBearer.add(bearer);
    void Promise.resolve(update({ refreshStanding: true })).catch(() => undefined);
  }, [status, session, update]);

  // Publish the panel's height while it is shown; clear it when it goes.
  useLayoutEffect(() => {
    if (!suspended || panel === null) return;
    const root = document.documentElement;
    const publish = () => {
      const height = panel.getBoundingClientRect().height;
      root.style.setProperty(BOTTOM_RESERVE_VAR, `${Math.ceil(height) + RESERVE_GAP_PX}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(panel);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(BOTTOM_RESERVE_VAR);
    };
  }, [suspended, panel]);

  if (!suspended) return null;

  return (
    <BottomSlot>
      <section
        ref={setPanel}
        aria-labelledby={headingId}
        className="bcc-panel pointer-events-auto w-[min(420px,calc(100vw-2rem))] px-4 py-3 shadow-2xl"
      >
        <p className="text-sm text-bcc-text">
          <span id={headingId} className="bcc-mono mr-2 text-[11px] tracking-[0.18em] text-bcc-text-safety">
            ACCOUNT SUSPENDED
          </span>
          {SUSPENDED_NOTICE_LINE}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
          className="bcc-mono inline-flex min-h-[44px] items-center text-[11px] tracking-[0.12em] text-bcc-text-secondary underline underline-offset-2 hover:text-bcc-text"
        >
          What you can still do
        </button>
        {open && (
          <p id={detailsId} className="pb-1 font-serif text-sm leading-relaxed text-bcc-text-secondary">
            {SUSPENDED_NOTICE_DETAILS}
          </p>
        )}
      </section>
    </BottomSlot>
  );
}
