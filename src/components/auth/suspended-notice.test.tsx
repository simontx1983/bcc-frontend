/**
 * F-582: the suspension notice. Shown exactly when the session says
 * suspended; calm, not dismissable, with a "What you can still do"
 * disclosure. Its server re-read requests are bounded: at most one per
 * bearer per page load, and a failed read shows nothing and never loops.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  value: { data: null as unknown, status: "unauthenticated" as string },
  update: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ ...auth.value, update: auth.update }),
}));

import {
  resetSuspendedNoticeAsks,
  SUSPENDED_NOTICE_DETAILS,
  SuspendedNotice,
} from "@/components/auth/SuspendedNotice";

function signedIn(user: Record<string, unknown>, bccTokenExpiresAt = 1_000) {
  auth.value = {
    status: "authenticated",
    data: { user: { id: "7", handle: "welder", inGoodStanding: true, ...user }, bccToken: "tok", bccTokenExpiresAt, expires: "" },
  };
}

beforeEach(() => {
  resetSuspendedNoticeAsks();
  auth.update.mockReset();
  auth.update.mockResolvedValue(null);
  auth.value = { data: null, status: "unauthenticated" };
});
afterEach(cleanup);

describe("what it shows", () => {
  it("a suspended member sees the compact notice, with no way to dismiss it", () => {
    signedIn({ suspended: true });
    render(<SuspendedNotice />);
    const panel = screen.getByRole("region", { name: "ACCOUNT SUSPENDED" });
    expect(panel).toHaveTextContent("ACCOUNT SUSPENDED");
    expect(panel).toHaveTextContent("Your account is read-only for now.");
    expect(screen.queryByRole("button", { name: /dismiss|close/i })).toBeNull();
  });

  it("'What you can still do' opens the full list", () => {
    signedIn({ suspended: true });
    render(<SuspendedNotice />);
    const toggle = screen.getByRole("button", { name: "What you can still do" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(SUSPENDED_NOTICE_DETAILS)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(SUSPENDED_NOTICE_DETAILS)).toBeInTheDocument();
    expect(SUSPENDED_NOTICE_DETAILS).toContain("appeal a finding against you");
    expect(toggle).toHaveClass("min-h-[44px]");
  });

  it("the copy carries no dates", () => {
    expect(SUSPENDED_NOTICE_DETAILS).not.toMatch(/\d|until|days?\b|week|month/i);
  });

  it.each([
    ["not suspended", { suspended: false }],
    ["unknown (absent)", {}],
  ])("%s → nothing", (_l, user) => {
    signedIn(user);
    const { container } = render(<SuspendedNotice />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("ACCOUNT SUSPENDED")).toBeNull();
  });

  it("signed out → nothing, and no request", () => {
    const { container } = render(<SuspendedNotice />);
    expect(container).toBeEmptyDOMElement();
    expect(auth.update).not.toHaveBeenCalled();
  });
});

describe("asking the server to re-read the standing (bounded)", () => {
  it("a known standing on page load asks nothing", () => {
    signedIn({ suspended: false });
    render(<SuspendedNotice />);
    expect(auth.update).not.toHaveBeenCalled();
  });

  it("an unknown standing asks once, with refreshStanding only (never a value)", () => {
    signedIn({});
    const { rerender } = render(<SuspendedNotice />);
    expect(auth.update).toHaveBeenCalledTimes(1);
    expect(auth.update).toHaveBeenCalledWith({ refreshStanding: true });
    // The re-read failed and the standing is still unknown: no second ask.
    signedIn({});
    rerender(<SuspendedNotice />);
    rerender(<SuspendedNotice />);
    expect(auth.update).toHaveBeenCalledTimes(1);
  });

  it("a rejected ask shows nothing and does not loop", async () => {
    auth.update.mockRejectedValue(new Error("network"));
    signedIn({});
    const { container, rerender } = render(<SuspendedNotice />);
    await act(async () => {});
    rerender(<SuspendedNotice />);
    expect(container).toBeEmptyDOMElement();
    expect(auth.update).toHaveBeenCalledTimes(1);
  });

  it("a refresh (a new bearer) asks once more, so a lifted suspension can clear", () => {
    signedIn({ suspended: true }, 1_000);
    const { rerender } = render(<SuspendedNotice />);
    expect(auth.update).not.toHaveBeenCalled();
    signedIn({ suspended: true }, 2_000);
    rerender(<SuspendedNotice />);
    expect(auth.update).toHaveBeenCalledTimes(1);
    rerender(<SuspendedNotice />);
    expect(auth.update).toHaveBeenCalledTimes(1);
  });
});
