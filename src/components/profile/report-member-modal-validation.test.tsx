import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

/**
 * F-311 (M5): the member-report modal disagreed with the server twice.
 *
 *   - "Other" accepted a one-character description; the server requires 10
 *     (BCC_DISPUTES_MIN_DETAIL_LENGTH) and answered `detail_required`.
 *   - /report-user's throttle sends the bare code `rate_limited`, and the
 *     modal mapped only `bcc_rate_limited`, so the member saw "Couldn't file
 *     the report. Try again." instead of "wait a moment".
 */

const mutate = vi.fn();
let onError: ((err: BccApiError) => void) | undefined;

vi.mock("@/hooks/useReportUser", () => ({
  useReportUser: (options: { onError?: (err: BccApiError) => void }) => {
    onError = options.onError;
    return { mutate, isPending: false };
  },
}));

import { ReportMemberModal } from "@/components/profile/ReportMemberModal";

// jsdom gap (same stub as Dialog.consumers.test.tsx): Dialog's
// usePrefersReducedMotion calls matchMedia, which jsdom does not implement.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  mutate.mockReset();
  onError = undefined;
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function chooseOtherAndType(text: string) {
  render(<ReportMemberModal reportedUserId={7} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("radio", { name: /other/i }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
}

describe("ReportMemberModal validation and errors", () => {
  it("does not submit an 'Other' report with fewer than 10 characters", () => {
    chooseOtherAndType("too short");

    const submit = screen.getByRole("button", { name: /submit report/i });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("submits once the description reaches 10 characters", () => {
    chooseOtherAndType("ten chars!");

    const submit = screen.getByRole("button", { name: /submit report/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("tells the member to wait when the server sends the bare rate_limited code", () => {
    chooseOtherAndType("a long enough reason");

    act(() => {
      onError?.(new BccApiError("rate_limited", "Please wait 60 seconds before trying again.", 429, null));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/wait a moment/i);
  });
});
