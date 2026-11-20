/**
 * F-391 (bcc-trust #763): both review vote limits answer 429
 * bcc_rate_limited with data.retry_after_seconds, and the daily downvote
 * cap's wait can be hours. "Slow down — wait a moment" was wrong for it;
 * the copy now names the wait, rounded up.
 */

import { describe, expect, it } from "vitest";

import {
  REVIEW_LIMIT_FALLBACK_COPY,
  humanizeReviewError,
} from "@/components/composer/review-error-copy";
import { retryAfterSeconds } from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";
import { formatWaitDuration } from "@/lib/format";

const limited = (seconds?: unknown) =>
  new BccApiError(
    "bcc_rate_limited",
    "RAW SERVER TEXT",
    429,
    seconds === undefined
      ? null
      : ({ error: { code: "bcc_rate_limited", message: "x", status: 429, data: { retry_after_seconds: seconds } } } as never),
  );

describe("review limit copy", () => {
  it.each([
    [45, "a minute"],
    [600, "10 minutes"],
    [5_400, "90 minutes"],
    [26_280, "8 hours"],
  ])("a %i s wait reads %s", (seconds, words) => {
    expect(humanizeReviewError(limited(seconds))).toBe(
      `You've hit a review limit. Try again in ${words}.`,
    );
  });

  it("no wait (or an unusable one) is a neutral line with no number", () => {
    expect(humanizeReviewError(limited())).toBe(REVIEW_LIMIT_FALLBACK_COPY);
    expect(humanizeReviewError(limited(0))).toBe(REVIEW_LIMIT_FALLBACK_COPY);
    expect(humanizeReviewError(limited("3600"))).toBe(REVIEW_LIMIT_FALLBACK_COPY);
  });

  it("never shows the server's text", () => {
    expect(humanizeReviewError(limited(60))).not.toContain("RAW SERVER TEXT");
  });

  it("the forbidden copy keeps its daily-cap clause until #763 is in production", () => {
    const forbidden = new BccApiError("bcc_forbidden", "x", 403, null);
    expect(humanizeReviewError(forbidden)).toContain("downvotes are capped daily");
  });
});

describe("formatWaitDuration", () => {
  it("rounds UP, so the named wait is never shorter than the real one", () => {
    expect(formatWaitDuration(61)).toBe("2 minutes");
    expect(formatWaitDuration(7_199)).toBe("2 hours");
    expect(formatWaitDuration(7_201)).toBe("3 hours");
  });

  it("a minute or less, or nonsense, reads 'a minute'", () => {
    expect(formatWaitDuration(1)).toBe("a minute");
    expect(formatWaitDuration(60)).toBe("a minute");
    expect(formatWaitDuration(Number.NaN)).toBe("a minute");
  });
});

describe("retryAfterSeconds", () => {
  it("only a rate-limit 429 carries a wait", () => {
    expect(retryAfterSeconds(limited(30))).toBe(30);
    expect(retryAfterSeconds(new BccApiError("bcc_forbidden", "x", 403, null))).toBeNull();
    expect(retryAfterSeconds(new Error("x"))).toBeNull();
  });
});
