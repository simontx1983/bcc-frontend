/**
 * AnalyticsPageview hands every readable route change to the wrapper,
 * whatever the consent choice: the wrapper is what deletes an owed
 * `signup_completed` marker when there is no consent, so skipping the
 * call would leave that marker to be sent after a later opt-in. During
 * hydration the choice reads "unknown" and nothing is called.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pageview: vi.fn(),
  consent: "unknown" as "granted" | "denied" | null | "unknown",
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/onboarding" }));
vi.mock("@/hooks/useAnalyticsConsent", () => ({ useAnalyticsConsent: () => h.consent }));
vi.mock("@/lib/analytics/posthog", () => ({
  captureAnalyticsPageview: (p: string) => h.pageview(p),
}));

const { AnalyticsPageview } = await import("@/components/analytics/AnalyticsPageview");

beforeEach(() => {
  h.pageview.mockReset();
});
afterEach(cleanup);

describe("AnalyticsPageview", () => {
  it("does nothing while the choice is unreadable (hydration)", () => {
    h.consent = "unknown";
    render(<AnalyticsPageview />);
    expect(h.pageview).not.toHaveBeenCalled();
  });

  it.each(["granted", "denied", null] as const)("calls the wrapper when the choice is %s", (choice) => {
    h.consent = choice;
    render(<AnalyticsPageview />);
    expect(h.pageview).toHaveBeenCalledWith("/onboarding");
  });
});
