/**
 * Loading / empty / load-more shapes shared by the validator admin lists
 * (Validator Directory, Audit History). Failed reads live in
 * AdminReadFailure.
 *
 *   - loading: SKELETON_CLASS rows shaped like the real rows, plus a
 *     screen-reader status line (the skeletons are aria-hidden).
 *   - empty: the canonical paper sheet — eyebrow, stencil heading, serif
 *     body, and a way out when there is one.
 *   - load more: one outline button; disabled while the next page loads.
 */

import { SKELETON_CLASS } from "@/components/ui/Skeleton";

export function AdminListSkeleton({ label, rowClassName }: { label: string; rowClassName: string }) {
  return (
    <div>
      <p role="status" className="sr-only">
        {label}
      </p>
      <ul aria-hidden className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className={SKELETON_CLASS + " " + rowClassName} />
        ))}
      </ul>
    </div>
  );
}

export interface AdminEmptyStateProps {
  eyebrow: string;
  heading: string;
  body: string;
  action?: { label: string; onClick: () => void } | undefined;
}

export function AdminEmptyState({ eyebrow, heading, body, action }: AdminEmptyStateProps) {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-bcc-text-safety">{eyebrow}</p>
      <h2 className="bcc-stencil text-3xl text-ink">{heading}</h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">{body}</p>
      {action !== undefined && (
        <button
          type="button"
          onClick={action.onClick}
          className="bcc-mono mt-6 inline-flex min-h-[44px] items-center gap-2 border border-cardstock-edge bg-cardstock px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-cardstock-deep/40"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export interface AdminLoadMoreProps {
  loading: boolean;
  onLoadMore: () => void;
}

export function AdminLoadMore({ loading, onLoadMore }: AdminLoadMoreProps) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => {
          if (!loading) onLoadMore();
        }}
        disabled={loading}
        className="bcc-btn bcc-btn-outline min-h-[44px]"
      >
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}
