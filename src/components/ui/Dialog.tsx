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
  /**
   * Opt into a true edge-to-edge bottom sheet on mobile: zero backdrop
   * inset (the panel touches the viewport edges) plus a slide-up-on-open
   * transition. Off by default — the existing bottom-sheet-on-phones
   * split already gives every other call-site (OpenDisputeModal,
   * NftPickerModal, etc.) a small margin around the sheet, which reads
   * fine for action pickers. The post quick view opts in because a
   * detail-view sheet should feel native (flush, slides up) not floating.
   * Always skipped under prefers-reduced-motion.
   */
  mobileSheet?: boolean;
  /**
   * Override the backdrop's tint/blur utilities (default
   * "bg-ink/70 backdrop-blur-sm"). The Lightbox opts into a darker,
   * heavier blur ("bg-ink/90 backdrop-blur-md") so a full-bleed image
   * reads as theater mode rather than a floating card. Layout utilities
   * (fixed/inset/z/flex) are unaffected.
   */
  backdropClassName?: string;
  /**
   * Frost the inner panel with the app's glass surface (`--bcc-glass-*`)
   * instead of the opaque `bcc-panel` background — for modals that should
   * read as floating over the page rather than a solid card (e.g.
   * RankInfoModal). No effect when `bare` (the caller owns its own
   * surface). The backdrop is unaffected — only the panel frosts.
   */
  glass?: boolean;
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
  mobileSheet = false,
  backdropClassName = "bg-ink/70 backdrop-blur-sm",
  glass = false,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const fade = animateIn && !reducedMotion;
  const slide = mobileSheet && !reducedMotion;
  const animate = fade || slide;
  const [shown, setShown] = useState(!animate);

  // Trigger the fade-in / slide-up next frame so the transition runs.
  useEffect(() => {
    if (!animate) return;
    const id = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(id);
  }, [animate]);

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
        "fixed inset-0 z-[400] flex justify-center " + backdropClassName + " " +
        (mobileSheet ? "p-0 md:p-4 " : "p-4 ") +
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
          (bare
            ? "relative w-full outline-none "
            : glass
              ? "relative w-full rounded-2xl p-6 outline-none md:p-8 "
              : "bcc-panel relative w-full p-6 outline-none md:p-8 ") +
          (mobileSheet
            ? "md:translate-y-0 " +
              (slide ? "transition-transform duration-200 " + (shown ? "translate-y-0" : "translate-y-full") + " " : "")
            : "") +
          panelClassName
        }
        style={
          !bare && glass
            ? {
                // The lighter `--bcc-glass-bg` (.62 opacity) reads as too
                // transparent on a full modal panel full of text — use the
                // more-opaque "solid" glass tier + heavier blur instead, the
                // same combination the header/nav glass surfaces use.
                background: "var(--bcc-glass-bg-solid)",
                backdropFilter: "blur(var(--bcc-glass-blur-heavy))",
                WebkitBackdropFilter: "blur(var(--bcc-glass-blur-heavy))",
                border: "1px solid var(--bcc-glass-border)",
              }
            : undefined
        }
      >
        {!bare && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--bcc-text-secondary)] transition-colors hover:text-[var(--bcc-text)]"
            style={{
              background: "var(--bcc-glass-bg)",
              backdropFilter: "blur(var(--bcc-glass-blur))",
              WebkitBackdropFilter: "blur(var(--bcc-glass-blur))",
              border: "1px solid var(--bcc-glass-border)",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
