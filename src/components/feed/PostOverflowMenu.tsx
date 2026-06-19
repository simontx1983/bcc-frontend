"use client";

/**
 * PostOverflowMenu — zone-2 "⋯" affordance shared by FeedItemCard and
 * PostDetail. One real action today (copy link); the inline popover
 * shape leaves room for "Mute author" / "Hide post" etc. later without
 * redesigning the affordance.
 */

import { useEffect, useRef, useState } from "react";

import { useCopyConfirm } from "@/hooks/useCopyConfirm";

export function PostOverflowMenu({ selfHref }: { selfHref: string }) {
  const [open, setOpen] = useState(false);
  const { copied, copy } = useCopyConfirm();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="bcc-mono inline-flex min-h-[20px] items-center px-1 text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="bcc-panel absolute right-0 top-full z-20 mt-1 min-w-[140px] p-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void copy(`${window.location.origin}${selfHref}`);
            }}
            className="bcc-mono block w-full rounded-sm px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-text)]"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
