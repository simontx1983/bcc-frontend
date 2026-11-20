/**
 * F-317 M-gr4 / M-gr2 (Hall side) — the /halls/[slug] membership controls.
 *
 *   - Leaving your primary Hall confirmed through the browser's native
 *     window.confirm (no focus trap, no app styling, blocks the page); it
 *     now confirms in the shared ConfirmDialog.
 *   - "★ PRIMARY · CLEAR" cleared the primary on one tap, with nothing in
 *     between; it confirms now too.
 *   - A pending button was `disabled`, which drops keyboard focus to
 *     <body>, and a successful LEAVE took its own button away with nothing
 *     said. Now pending is aria-disabled (refused in the handler), focus
 *     moves to the remaining button once the refreshed membership lands,
 *     and a polite line says what changed.
 *
 * Only the API client is faked; the page refresh is simulated by
 * re-rendering with the next server state. Fixtures only.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type HallItem } from "@/lib/api/types";

const bccFetchAsClient = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ bccFetchAsClient, bccFetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/halls/osmosis",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: null }) }));

import { HALL_CONFIRM_COPY, HallMembershipControls } from "@/components/halls/HallMembershipControls";

beforeAll(() => {
  // The Dialog reads reduced motion.
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

let client: QueryClient;

beforeEach(() => {
  bccFetchAsClient.mockReset();
  refresh.mockReset();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

afterEach(cleanup);

type Membership = HallItem["viewer_membership"];
const NON_MEMBER = { is_member: false, is_primary: false } as unknown as Membership;
const MEMBER = { is_member: true, is_primary: false } as unknown as Membership;
const PRIMARY = { is_member: true, is_primary: true } as unknown as Membership;

function wrap(ui: ReactElement) {
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}
const controls = (membership: Membership) => <HallMembershipControls groupId={7} membership={membership} />;

const button = (name: string) => screen.getByRole("button", { name });
const live = () => screen.getByRole("status");
const dialog = (title: string) => screen.getByRole("dialog", { name: title });

function press(el: HTMLElement) {
  el.focus();
  fireEvent.click(el);
}

describe("leaving your primary Hall confirms in the app's dialog, not window.confirm", () => {
  it("LEAVE opens the dialog and sends nothing yet; window.confirm is never called", () => {
    const native = vi.spyOn(window, "confirm");
    render(wrap(controls(PRIMARY)));

    press(button("LEAVE"));

    expect(dialog(HALL_CONFIRM_COPY.leave.title)).toHaveTextContent(HALL_CONFIRM_COPY.leave.body);
    expect(bccFetchAsClient).not.toHaveBeenCalled();
    expect(native).not.toHaveBeenCalled();
    native.mockRestore();
  });

  it("STAY closes it and leaves nothing", async () => {
    render(wrap(controls(PRIMARY)));
    press(button("LEAVE"));

    fireEvent.click(within(dialog(HALL_CONFIRM_COPY.leave.title)).getByRole("button", { name: "STAY" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bccFetchAsClient).not.toHaveBeenCalled();
  });

  it("confirming leaves, closes the dialog and refreshes the page", async () => {
    bccFetchAsClient.mockResolvedValue({ left: true });
    render(wrap(controls(PRIMARY)));
    press(button("LEAVE"));

    fireEvent.click(within(dialog(HALL_CONFIRM_COPY.leave.title)).getByRole("button", { name: "LEAVE" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bccFetchAsClient).toHaveBeenCalledWith("me/halls/7/membership", expect.objectContaining({ method: "DELETE" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a failure shows inside the dialog, which stays open to try again; nothing shows under the buttons", async () => {
    bccFetchAsClient.mockRejectedValue(new BccApiError("bcc_unavailable", "raw server prose", 503, null));
    render(wrap(controls(PRIMARY)));
    press(button("LEAVE"));

    fireEvent.click(within(dialog(HALL_CONFIRM_COPY.leave.title)).getByRole("button", { name: "LEAVE" }));

    const open = dialog(HALL_CONFIRM_COPY.leave.title);
    expect(await within(open).findByText("Membership service is down. Try again shortly.")).toBeInTheDocument();
    expect(within(open).getByRole("button", { name: "TRY AGAIN" })).toBeInTheDocument();
    expect(screen.getAllByText("Membership service is down. Try again shortly.")).toHaveLength(1);
    expect(screen.queryByText("raw server prose")).toBeNull();
  });

  it("control: leaving a Hall that is not your primary needs no confirm", async () => {
    bccFetchAsClient.mockResolvedValue({ left: true });
    render(wrap(controls(MEMBER)));

    press(button("LEAVE"));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

describe("clearing your primary Hall confirms first", () => {
  it("★ PRIMARY · CLEAR opens the dialog and sends nothing yet", () => {
    render(wrap(controls(PRIMARY)));

    press(button("★ PRIMARY · CLEAR"));

    expect(dialog(HALL_CONFIRM_COPY.clear.title)).toHaveTextContent(HALL_CONFIRM_COPY.clear.body);
    expect(bccFetchAsClient).not.toHaveBeenCalled();
  });

  it("confirming clears it and refreshes; KEEP IT clears nothing", async () => {
    bccFetchAsClient.mockResolvedValue({ cleared: true });
    render(wrap(controls(PRIMARY)));

    press(button("★ PRIMARY · CLEAR"));
    fireEvent.click(within(dialog(HALL_CONFIRM_COPY.clear.title)).getByRole("button", { name: "KEEP IT" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bccFetchAsClient).not.toHaveBeenCalled();

    press(button("★ PRIMARY · CLEAR"));
    fireEvent.click(within(dialog(HALL_CONFIRM_COPY.clear.title)).getByRole("button", { name: "CLEAR" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bccFetchAsClient).toHaveBeenCalledWith("me/halls/primary", expect.objectContaining({ method: "DELETE" }));
  });

  it("control: SET AS PRIMARY stays one tap", async () => {
    bccFetchAsClient.mockResolvedValue({ primary_hall: {} });
    render(wrap(controls(MEMBER)));

    press(button("SET AS PRIMARY"));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

describe("focus and announcement (M-gr2, Hall side)", () => {
  it("a pending button is aria-disabled and busy, not disabled, and keeps focus; a second press sends nothing", async () => {
    bccFetchAsClient.mockReturnValue(new Promise(() => {}));
    render(wrap(controls(NON_MEMBER)));

    press(button("JOIN HALL"));
    const pending = await screen.findByRole("button", { name: "Saving…" });

    expect(pending).toHaveAttribute("aria-disabled", "true");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).not.toHaveAttribute("disabled");
    expect(document.activeElement).toBe(pending);
    fireEvent.click(pending);
    expect(bccFetchAsClient).toHaveBeenCalledTimes(1);
  });

  it("after a LEAVE, focus moves to JOIN HALL and the leave is announced", async () => {
    bccFetchAsClient.mockResolvedValue({ left: true });
    const { rerender } = render(wrap(controls(MEMBER)));
    expect(live()).toHaveTextContent("");

    press(button("LEAVE"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(wrap(controls(NON_MEMBER)));

    expect(document.activeElement).toBe(button("JOIN HALL"));
    expect(live()).toHaveTextContent("You left this Hall.");
  });

  it("after a JOIN, focus stays on the same button (now SET AS PRIMARY) and the join is announced", async () => {
    bccFetchAsClient.mockResolvedValue({ joined: true });
    const { rerender } = render(wrap(controls(NON_MEMBER)));

    press(button("JOIN HALL"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(wrap(controls(MEMBER)));

    expect(document.activeElement).toBe(button("SET AS PRIMARY"));
    expect(live()).toHaveTextContent("You joined this Hall.");
  });

  it("a failed LEAVE, then a refresh that changed nothing here, moves no focus", async () => {
    bccFetchAsClient.mockRejectedValue(new BccApiError("bcc_unavailable", "raw server prose", 503, null));
    const { rerender } = render(wrap(controls(MEMBER)));

    press(button("LEAVE"));
    await screen.findByRole("alert");
    (document.activeElement as HTMLElement).blur();
    rerender(wrap(controls({ ...MEMBER } as Membership)));

    expect(document.activeElement).toBe(document.body);
  });

  it("primary set and cleared are announced; a page that loads in any state says nothing", () => {
    const { rerender } = render(wrap(controls(MEMBER)));
    expect(live()).toHaveTextContent("");

    rerender(wrap(controls(PRIMARY)));
    expect(live()).toHaveTextContent("This is now your primary Hall.");

    rerender(wrap(controls(MEMBER)));
    expect(live()).toHaveTextContent("Your primary Hall is cleared.");
  });
});
