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

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return undefined;
    }
    const el = ref.current;
    if (el === null) return undefined;
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
      style: { ...style, ...(delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : {}) },
    },
    children,
  );
}
