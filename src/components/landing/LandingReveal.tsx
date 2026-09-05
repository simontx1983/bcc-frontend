"use client";

/**
 * LandingReveal — fade/translate-up on scroll into view, once, via
 * IntersectionObserver (matches the mockup's `.rv`/`.rv.in` pattern).
 * `prefers-reduced-motion` renders already-visible instead of observing.
 *
 * Polymorphic tag via `React.createElement` rather than a dynamic JSX
 * `<Tag>` — JSX's per-tag ref inference doesn't unify cleanly across a
 * `div | p | h2` union without an unsafe cast; `createElement`'s typing
 * is intentionally looser here and stays fully typed.
 *
 * ## Readable first, animated second
 *
 * `.bcc-ldg-reveal` is `opacity: 0` and only `.is-visible` restores it, so
 * the SERVER-rendered HTML used to ship every wrapped heading and paragraph
 * invisible — confirmed on the onboarding wizard, whose SSR output carried
 * five reveal elements and zero `is-visible`. Everything readable then
 * depended on hydration AND an IntersectionObserver callback firing. If
 * either failed, the copy never appeared at all; on a slow connection the
 * first paint was a progress bar and two buttons.
 *
 * The fix inverts the default: `data-bcc-reveal="armed"` is set by the
 * client only once it has actually taken responsibility for revealing, and
 * the CSS hides the element only in that armed state. No JS, failed
 * hydration, or a dead observer ⇒ the attribute is never applied ⇒ the
 * content is simply visible, which is the correct baseline for text.
 *
 * The animation is unchanged for everyone whose browser can run it.
 */

import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export function LandingReveal({
  children,
  delayMs = 0,
  className = "",
  style,
  as = "div",
}: {
  children: ReactNode;
  /** Stagger delay in ms, applied via `transition-delay`. */
  delayMs?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "p" | "h2";
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  /**
   * False through SSR and the first client render, so the hidden state is
   * never what the server ships. Flipped only when this effect runs — i.e.
   * once JS is genuinely driving the reveal and can be trusted to finish it.
   */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (reduced) {
      // Nothing to animate — leave `armed` false so the element is simply
      // visible, rather than arming the hidden state and then undoing it.
      setVisible(true);
      return undefined;
    }
    const el = ref.current;
    if (el === null) return undefined;

    // `IntersectionObserver` is not guaranteed (old browsers, some embedded
    // webviews, JSDOM). Without it there is no way to reveal on scroll, so
    // stay unarmed and readable instead of hiding content forever.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }

    setArmed(true);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry !== undefined && entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  return createElement(
    as,
    {
      ref,
      className: "bcc-ldg-reveal" + (visible ? " is-visible" : "") + (className !== "" ? " " + className : ""),
      // The CSS only hides an ARMED element (see globals.css). Unarmed —
      // server output, no JS, no IntersectionObserver — renders normally.
      ...(armed && !visible ? { "data-bcc-reveal": "armed" } : {}),
      style: { ...style, ...(delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : {}) },
    },
    children,
  );
}
