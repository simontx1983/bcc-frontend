/**
 * Review-surface error copy (§γ: each call site owns its copy map; never
 * render err.message). Moved out of Composer.tsx so it can be tested.
 *
 * `bcc_forbidden` here is the VOTE-pipeline denial, not the write_review
 * gate: PostsService::createReview surfaces a VoteEligibilityException as
 * bcc_forbidden. That covers the downvote tier gate ("trusted or elite
 * only"), the identity-verification gate and the fraud/coordination
 * gates (bcc-trust app/Domain/Core/Services/Vote/VoteEligibilityChecker.php).
 * The composer-wide copy ("keep watching cards…") describes the
 * write_review unlock, which can't fire from this form: ReviewCallout
 * only opens the modal when `can_review` is already true. So the copy
 * leads with the gates that CAN fire.
 *
 * F-391 (bcc-trust #763): both review vote limits, the 20-per-minute
 * limit and the 3-per-day downvote cap (a SLIDING 24 h window, so the
 * wait can be hours), answer `bcc_rate_limited` 429 with
 * `data.retry_after_seconds`. The copy names that wait; without it, a
 * neutral line with no number. Until #763 is in production the daily cap
 * still answers 403, so the forbidden entry keeps its "capped daily"
 * clause; a follow-up removes it once #763 ships.
 */

import { humanizeCode, retryAfterSeconds } from "@/lib/api/errors";
import { formatWaitDuration } from "@/lib/format";

export const REVIEW_LIMIT_FALLBACK_COPY = "You've hit a review limit. Try again later.";

/** The review-limit line, naming the server's wait when it sent one. */
export function reviewLimitCopy(err: unknown): string {
  const seconds = retryAfterSeconds(err);
  return seconds === null
    ? REVIEW_LIMIT_FALLBACK_COPY
    : `You've hit a review limit. Try again in ${formatWaitDuration(seconds)}.`;
}

export function humanizeReviewError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to post a review.",
      bcc_invalid_request: "That review can't be sent — check the grade and body.",
      bcc_forbidden:
        "This review was blocked by a trust-safety gate. Caution reviews require trusted or elite standing and a verified identity (linked wallet or GitHub), and downvotes are capped daily.",
      bcc_rate_limited: reviewLimitCopy(err),
      bcc_unavailable: "Reviews are temporarily unavailable. Try again shortly.",
    },
    "Couldn't post your review. Try again.",
  );
}
