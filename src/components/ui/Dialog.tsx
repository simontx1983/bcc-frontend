"use client";

// ─────────────────────────────────────────────────────────────────────
// Dialog — the shared modal shell for the app.
//
// Replaces the per-feature `ModalShell` copies that lived inline in
// OpenDisputeModal / Composer / NftPickerModal / ClaimFlow /
// EligibleCommunitiesModal (each carried a "kept local until the design
// system grows a real <Dialog>" note). The markup is the same idiom those
// copies shared — ink backdrop, frosted blur, bottom-sheet on phones,
// centered card on md+, corner "ESC" button — so call-sites look identical.
//
// What this centralizes that the copies were missing or had drifted on:
//   • ESC closes (only Composer's copy had this)
//   • focus trap — Tab/Shift+Tab cycle within the panel
//   • focus return — restore focus to the trigger on close
//   • body scroll lock while open
//
// Presentational only: no data, no fetch, no business logic.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type DialogProps = {
  /** Accessible name for the dialog (also fed to aria-label). */
  title: string;
  /** Called on ESC, backdrop click, or the corner ESC button. */
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Layout overrides for the inner panel so each surface keeps its own
   * width / height / scroll behavior (e.g. "max-w-3xl max-h-[92vh]
   * overflow-y-auto" or "flex flex-col gap-3"). Defaults to "max-w-2xl".
   */
  panelClassName?: string;
  /**
   * Fade the backdrop in on open. Off by default (modals opened on an
   * explicit click appear instantly); auto-surfacing modals opt in.
   * Always skipped under prefers-reduced-motion.
   */
  animateIn?: boolean;
  /**
   * Skip the bcc-panel chrome (padding/shadow/rounding) and the corner
   * ESC button on the inner panel — for callers whose children already
   * supply their own panel surface and dismiss control (e.g. the
   * Composer's own card + "discard draft" X). Backdrop, focus trap,
   * ESC-to-close, and scroll lock are unchanged.
   */
  bare?: boolean;
  /**
   * Center the panel on every breakpoint instead of the default
   * bottom-sheet-on-phones / centered-on-md+ split. Off by default —
   * the bottom sheet is the established mobile idiom for picker/action
   * modals (OpenDisputeModal, NftPickerModal, etc). Opt in for modals
   * that read as a single floating card rather than a sheet (the New
   * Post composer).
   */
  center?: boolean;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({
  title,
  onClose,
  children,
  panelClassName = "max-w-2xl",
  animateIn = false,
  bare = false,
  center = false,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const fade = animateIn && !reducedMotion;
  const [shown, setShown] = useState(!fade);

  // Trigger the fade-in next frame so the opacity transition runs.
  useEffect(() => {
    if (!fade) return;
    const id = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(id);
  }, [fade]);

  // ESC to close + Tab focus trap, scoped to this dialog's lifetime.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Focus the panel on open; restore focus to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  // Lock body scroll while the dialog is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Portaled to document.body — trigger sites like MobileNav's center
  // button set `backdrop-filter` on an ancestor, which (per spec) gives
  // `position: fixed` descendants a containing block other than the
  // viewport. Rendered inline, the backdrop would be confined to that
  // ancestor's box instead of covering the screen. The portal sidesteps
  // any ancestor's stacking/containing-block quirks entirely.
  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className={
        // z-[400] clears the fixed SiteHeader (z-300) and MobileNav
        // (z-200) — a dialog must always sit above both chrome layers.
        "fixed inset-0 z-[400] flex justify-center bg-ink/70 p-4 backdrop-blur-sm " +
        (center ? "items-center " : "items-end md:items-center ") +
        (fade ? "transition-opacity duration-200 " + (shown ? "opacity-100" : "opacity-0") : "")
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={
          (bare ? "relative w-full outline-none " : "bcc-panel relative w-full p-6 outline-none md:p-8 ") +
          panelClassName
        }
      >
        {!bare && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bcc-mono absolute right-4 top-4 text-[10px] tracking-[0.24em] text-cardstock-deep hover:text-ink"
          >
            ESC
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
