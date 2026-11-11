import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  // The wrapper reads these at module load.
  process.env["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"] = "phc_test";
  process.env["NEXT_PUBLIC_POSTHOG_HOST"] = "https://ph.example";
  return {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  };
});

vi.mock("posthog-js", () => ({ default: sdk }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AnalyticsConsentBanner } from "@/components/analytics/AnalyticsConsentBanner";
import { AnalyticsConsentControl } from "@/components/analytics/AnalyticsConsentControl";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AnalyticsConsentBanner", () => {
  it("asks once, and Allow records consent and hides the banner", () => {
    render(<AnalyticsConsentBanner />);
    expect(screen.getByRole("region", { name: "Analytics" })).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    });

    expect(window.localStorage.getItem("bcc-analytics-consent")).toBe("granted");
    expect(screen.queryByRole("region", { name: "Analytics" })).toBeNull();
  });

  it("Decline records the choice without starting the SDK", () => {
    sdk.init.mockClear();
    render(<AnalyticsConsentBanner />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    });
    expect(window.localStorage.getItem("bcc-analytics-consent")).toBe("denied");
    expect(sdk.init).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Analytics" })).toBeNull();
  });

  it("stays hidden once a choice exists", () => {
    window.localStorage.setItem("bcc-analytics-consent", "denied");
    render(<AnalyticsConsentBanner />);
    expect(screen.queryByRole("region", { name: "Analytics" })).toBeNull();
  });
});

describe("AnalyticsConsentControl", () => {
  it("shows the current choice and lets it be changed", () => {
    window.localStorage.setItem("bcc-analytics-consent", "granted");
    render(<AnalyticsConsentControl />);
    expect(screen.getByText("Analytics is on for this browser.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow analytics" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Turn off analytics" }));
    });
    expect(window.localStorage.getItem("bcc-analytics-consent")).toBe("denied");
    expect(screen.getByText("Analytics is off for this browser.")).toBeInTheDocument();
  });
});
