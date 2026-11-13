/**
 * #288 review: a wallet signup from /login goes through onboarding, and the
 * deep link it came from is used once when onboarding finishes. Only a
 * same-origin relative path is ever stored or returned.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  ONBOARDING_RETURN_TO_KEY,
  takeOnboardingReturnTo,
  writeOnboardingReturnTo,
} from "@/lib/onboarding/return-to";

afterEach(() => window.sessionStorage.clear());

describe("onboarding return-to", () => {
  it("keeps a relative path with its query, used once", () => {
    writeOnboardingReturnTo("/v/atlas?tab=reviews");
    expect(takeOnboardingReturnTo()).toBe("/v/atlas?tab=reviews");
    expect(takeOnboardingReturnTo()).toBeNull();
  });

  it.each([null, "", "/", "https://evil.example", "//evil.example", "/a b"])(
    "stores nothing for %s (onboarding ends on the Floor)",
    (bad) => {
      writeOnboardingReturnTo(bad);
      expect(window.sessionStorage.getItem(ONBOARDING_RETURN_TO_KEY)).toBeNull();
      expect(takeOnboardingReturnTo()).toBeNull();
    },
  );

  it("a tampered stored value is refused on read", () => {
    window.sessionStorage.setItem(ONBOARDING_RETURN_TO_KEY, "//evil.example");
    expect(takeOnboardingReturnTo()).toBeNull();
  });
});
