"use client";

/**
 * ShareButton — zone-5 action-rail share affordance shared by
 * FeedItemCard and PostDetail. `navigator.share()` on mobile (native
 * share sheet); feature-detected clipboard fallback on desktop, reusing
 * the same confirmation idiom as PostOverflowMenu's copy action.
 */

import { ActionRailButton } from "@/components/feed/ActionRailButton";
import { ShareIcon } from "@/components/feed/actionIcons";
import { useCopyConfirm } from "@/hooks/useCopyConfirm";

export function ShareButton({
  selfHref,
  shareTitle,
}: {
  selfHref: string;
  shareTitle?: string;
}) {
  const { copied, copy } = useCopyConfirm();

  const handleClick = () => {
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
    <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <ActionRailButton
        icon={<ShareIcon />}
        label="Share"
        hoverClassName="hover:text-[var(--bcc-success)]"
        onClick={handleClick}
        ariaLabel="Share post"
        title={copied ? "Link copied" : "Share"}
      />
      {copied && (
        <span
          role="status"
          className="bcc-mono absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] tracking-[0.08em] text-[var(--bcc-text-inverse)] shadow-md"
          style={{ background: "var(--bcc-success)" }}
        >
          Link copied
        </span>
      )}
    </span>
  );
}
