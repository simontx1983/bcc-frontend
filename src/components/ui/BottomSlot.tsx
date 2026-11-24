"use client";

/**
 * BottomSlot — the one fixed bottom-centre slot (F-514).
 *
 * Five surfaces float in the same place, above the mobile bottom nav and
 * bottom centre on desktop:
 *  - PostedNotice's floating variant ("Posted — View post", #368);
 *  - AnalyticsConsentBanner;
 *  - AuthRedirectNotice;
 *  - UndoToast (moderation);
 *  - ThreadView's "New messages ↓" pill.
 * Each used to position itself with the same fixed classes, so whichever
 * painted last covered the others. Worse, PostedNotice renders inside the
 * desktop LeftSidebar's `.bcc-sidebar-pin-top`, a z-index 2 stacking
 * context, so its z-40 only ranked it inside the pin: against the page it
 * painted below the comment drawer's sticky composer (z-10), the card
 * menus (z-20) and FeedTabs (z-30).
 *
 * Now each renders its panel through <BottomSlot>, which portals it into
 * ONE host appended to document.body: a fixed column that stacks the
 * panels (oldest on top, newest nearest the edge) instead of overlapping
 * them, outside every stacking context in the page. The host itself takes
 * no clicks (`pointer-events-none`); each panel keeps `pointer-events-auto`
 * and its own width.
 *
 * The host is created by the first slot that mounts and removed when the
 * last one unmounts. It needs no provider, so a surface works the same in
 * any layout and in tests (jsdom has a document.body too). A slot renders
 * nothing until mounted, on the server and the first client render alike,
 * so hydration never sees a portal.
 *
 * A portal moves its content to the END of the document for Tab order.
 * That's fine for four of the five: each was already mounted near the end
 * of the page. PostedNotice is the exception, and it bridges focus itself
 * (see PostedNotice).
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const BOTTOM_SLOT_HOST_ID = "bcc-bottom-slot";

/** Above the mobile bottom nav; bottom centre on desktop. */
export const BOTTOM_SLOT_HOST_CLASS =
  "pointer-events-none fixed inset-x-4 bottom-[calc(var(--bcc-mobile-nav-total-h)+16px)] z-40 flex flex-col items-center gap-2 md:bottom-6";

function acquireHost(): HTMLElement {
  let host = document.getElementById(BOTTOM_SLOT_HOST_ID);
  if (host === null) {
    host = document.createElement("div");
    host.id = BOTTOM_SLOT_HOST_ID;
    host.className = BOTTOM_SLOT_HOST_CLASS;
    document.body.appendChild(host);
  }
  // The count lives on the element, not in module state, so a second
  // React root (or a hot reload) can't desync it.
  host.dataset["slots"] = String(Number(host.dataset["slots"] ?? "0") + 1);
  return host;
}

function releaseHost(host: HTMLElement): void {
  const left = Number(host.dataset["slots"] ?? "1") - 1;
  host.dataset["slots"] = String(left);
  if (left <= 0) host.remove();
}

export function BottomSlot({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const acquired = acquireHost();
    setHost(acquired);
    return () => releaseHost(acquired);
  }, []);

  return host === null ? null : createPortal(children, host);
}
