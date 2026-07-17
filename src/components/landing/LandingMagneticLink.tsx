"use client";

/**
 * LandingMagneticLink — the primary CTA's subtle cursor-follow nudge
 * (ported from the mockup's `.magnetic` behavior). Reduced-motion skips
 * the effect entirely — the link still works as a plain link either way.
 */

import Link from "next/link";
import type { Route } from "next";
import { useRef, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export function LandingMagneticLink({
  href,
  className,
  children,
}: {
  href: Route;
  className: string;
  children: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);

  const onMouseMove = reduced
    ? undefined
    : (e: React.MouseEvent<HTMLAnchorElement>) => {
        const el = ref.current;
        if (el === null) return;
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) / 6;
        const y = (e.clientY - rect.top - rect.height / 2) / 6 - 2;
        el.style.transform = `translate(${x}px, ${y}px)`;
      };
  const onMouseLeave = reduced
    ? undefined
    : () => {
        const el = ref.current;
        if (el !== null) el.style.transform = "";
      };

  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ transition: "transform 0.18s var(--bcc-ldg-ease, cubic-bezier(0.2, 0.9, 0.25, 1))" }}
    >
      {children}
    </Link>
  );
}
