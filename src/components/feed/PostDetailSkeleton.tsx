/**
 * PostDetailSkeleton — cold-nav fallback for `post/[id]/loading.tsx` and
 * its shortcode sibling. Only shown when the post isn't already sitting
 * in the React Query cache (see useCachedFeedItemByPath) — the common
 * feed-click path renders the real `<PostDetail>` instantly instead.
 */

import { Skeleton, SKELETON_CLASS } from "@/components/ui/Skeleton";

export function PostDetailSkeleton() {
  return (
    <div
      aria-label="Loading post"
      className="bcc-panel relative flex flex-col gap-3 p-4 pb-3 sm:p-5 sm:pb-3.5"
    >
      <div className="flex items-center gap-2.5">
        <div aria-hidden className={SKELETON_CLASS + " h-10 w-10 rounded-full"} />
        <div className="flex flex-col gap-1.5">
          <div aria-hidden className={SKELETON_CLASS + " h-3 w-32"} />
          <div aria-hidden className={SKELETON_CLASS + " h-2.5 w-20"} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>

      <div aria-hidden className={SKELETON_CLASS + " h-7 w-full max-w-[220px]"} />

      <div className="mt-1 flex flex-col gap-3 border-t border-[var(--bcc-border)] pt-3">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div key={idx} className="flex items-start gap-2.5">
            <div aria-hidden className={SKELETON_CLASS + " h-8 w-8 shrink-0 rounded-full"} />
            <div className="flex flex-1 flex-col gap-1.5">
              <div aria-hidden className={SKELETON_CLASS + " h-2.5 w-24"} />
              <div aria-hidden className={SKELETON_CLASS + " h-3 w-full"} />
              <div aria-hidden className={SKELETON_CLASS + " h-3 w-3/5"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
