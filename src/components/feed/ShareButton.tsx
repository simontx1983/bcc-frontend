"use client";

/**
 * ShareButton — zone-5 action-rail share affordance shared by
 * FeedItemCard and PostDetail. `navigator.share()` on mobile (native
 * share sheet); feature-detected clipboard fallback on desktop, reusing
 * the same confirmation idiom as PostOverflowMenu's copy action.
 */

import { useCopyConfirm } from "@/hooks/useCopyConfirm";

export function ShareButton({
  selfHref,
  shareTitle,
}: {
  selfHref: string;
  shareTitle?: string;
}) {
  const { copied, copy } = useCopyConfirm();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    void (async () => {
      const url = `${window.location.origin}${selfHref}`;
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ url, ...(shareTitle !== undefined ? { title: shareTitle } : {}) });
          return;
        } catch {
          // Cancelled or unsupported mid-flight — fall through to clipboard.
        }
      }
      void copy(url);
    })();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Share post"
      title={copied ? "Copied" : "Share"}
      className="bcc-mono inline-flex min-h-[36px] items-center gap-1 text-[11px] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M6.5 3.5h-2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 9 12.5 3.5M9 3.5h3.5V7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {copied && <span>Copied</span>}
    </button>
  );
}
