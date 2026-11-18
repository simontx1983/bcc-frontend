/**
 * #288 review: a wallet signup from /login goes through onboarding, and the
 * deep link it came from is used once when onboarding finishes. Only a
 * same-origin relative path is ever stored or returned, and only for the
 * member who wrote it (viewer-scoped key).
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  ONBOARDING_RETURN_TO_KEY,
  takeOnboardingReturnTo,
  writeOnboardingReturnTo,
} from "@/lib/onboarding/return-to";

afterEach(() => window.sessionStorage.clear());

const SCOPED = `${ONBOARDING_RETURN_TO_KEY}::7`;

describe("onboarding return-to", () => {
  it("keeps a relative path with its query, used once", () => {
    writeOnboardingReturnTo("/v/atlas?tab=reviews", "7");
    expect(window.sessionStorage.getItem(SCOPED)).toBe("/v/atlas?tab=reviews");
    expect(takeOnboardingReturnTo("7")).toBe("/v/atlas?tab=reviews");
    expect(takeOnboardingReturnTo("7")).toBeNull();
  });

  it.each([null, "", "/", "https://evil.example", "//evil.example", "/a b"])(
    "stores nothing for %s (onboarding ends on the Floor)",
    (bad) => {
      writeOnboardingReturnTo(bad, "7");
      expect(window.sessionStorage.getItem(SCOPED)).toBeNull();
      expect(takeOnboardingReturnTo("7")).toBeNull();
    },
  );

  it("a tampered stored value is refused on read", () => {
    window.sessionStorage.setItem(SCOPED, "//evil.example");
    expect(takeOnboardingReturnTo("7")).toBeNull();
  });

  it("another member's target is not followed, and is left for its owner", () => {
    writeOnboardingReturnTo("/v/atlas", "7");
    expect(takeOnboardingReturnTo("8")).toBeNull();
    expect(window.sessionStorage.getItem(SCOPED)).toBe("/v/atlas");
  });

  it("ignores an unscoped bare key", () => {
    window.sessionStorage.setItem(ONBOARDING_RETURN_TO_KEY, "/v/atlas");
    expect(takeOnboardingReturnTo("7")).toBeNull();
  });

  it.each([null, "anon"])("neither writes nor reads for scope %s", (scope) => {
    writeOnboardingReturnTo("/v/atlas", scope);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
    window.sessionStorage.setItem(`${ONBOARDING_RETURN_TO_KEY}::anon`, "/v/atlas");
    expect(takeOnboardingReturnTo(scope)).toBeNull();
  });
});
