/**
 * BioEditor — the editor that closes BioBox's dead end.
 *
 * `BioBox`'s owner empty state renders "NO BIO ON FILE — WRITE ONE →" and
 * linked to `?tab=profile`, a tab with no bio field anywhere on it. The
 * write path already existed (`PatchProfileBody.bio`, `useUpdateBio`); only
 * the UI was missing.
 *
 * ## Why there is no client-side length assertion here
 *
 * The server caps the bio at 500 BYTES, measured after
 * `sanitize_textarea_field()` (MyProfileEndpoint.php:210-217) — while its
 * message says "characters". JavaScript cannot reproduce that sanitiser, so
 * a local guard would measure a different string than the server does, and
 * would falsely reject markup that sanitises shorter. These tests therefore
 * assert the ABSENCE of client-side length gating, and that the frontend's
 * own wording never repeats the inaccurate "500 characters".
 *
 * The mutation is real (React Query) with only the transport mocked, so the
 * baseline genuinely comes from a resolved server response rather than from
 * a hand-set state flag.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const patchProfile = vi.fn();
vi.mock("@/lib/api/profile-endpoints", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, patchProfile: (...a: unknown[]) => patchProfile(...a) };
});

import { BioEditor } from "@/components/settings/profile/BioEditor";
import { BccApiError, type MemberProfile } from "@/lib/api/types";

const PROFILE = {
  id: 7,
  user_id: 7,
  handle: "welder",
  display_name: "Welder",
  bio: "",
} as unknown as MemberProfile;

function renderEditor(profile: MemberProfile = PROFILE) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BioEditor profile={profile} />
    </QueryClientProvider>,
  );
}

const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: /Save|Saving/ });

beforeAll(() => {
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
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
    configurable: true,
  });
});

beforeEach(() => {
  patchProfile.mockReset();
  searchParams = new URLSearchParams();
  window.history.replaceState(null, "", "/u/welder?tab=profile");
});
afterEach(cleanup);

describe("dirty model", () => {
  it("hydrates clean", () => {
    renderEditor({ ...PROFILE, bio: "existing bio" } as MemberProfile);
    expect(textarea().value).toBe("existing bio");
    expect(saveButton().hasAttribute("disabled")).toBe(true);
  });

  it("typing makes it dirty; returning to the confirmed value makes it clean again", () => {
    renderEditor({ ...PROFILE, bio: "existing bio" } as MemberProfile);
    fireEvent.change(textarea(), { target: { value: "changed" } });
    expect(saveButton().hasAttribute("disabled")).toBe(false);
    fireEvent.change(textarea(), { target: { value: "existing bio" } });
    expect(saveButton().hasAttribute("disabled")).toBe(true);
  });

  it("a successful save takes BOTH baseline and draft from the server's value", async () => {
    // The server sanitises, so what comes back can differ from what was
    // typed. Advancing only the baseline would leave the field permanently
    // dirty against a draft the server never stored.
    patchProfile.mockResolvedValue({ ...PROFILE, bio: "sanitised" });
    renderEditor();
    fireEvent.change(textarea(), { target: { value: "<b>sanitised</b>" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(textarea().value).toBe("sanitised"));
    expect(saveButton().hasAttribute("disabled")).toBe(true);
  });

  it("a failed save keeps the draft and stays dirty", async () => {
    patchProfile.mockRejectedValue(new Error("network"));
    renderEditor();
    fireEvent.change(textarea(), { target: { value: "worth keeping" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(textarea().value).toBe("worth keeping");
    expect(saveButton().hasAttribute("disabled")).toBe(false);
  });
});

describe("validation is the server's job", () => {
  it("does not gate submission on any local length rule", async () => {
    patchProfile.mockResolvedValue({ ...PROFILE, bio: "x" });
    renderEditor();
    // Far over the server's 500-byte cap. The client must still send it and
    // let the server decide — a local guard could not measure the sanitised
    // string and would reject text the server would accept.
    fireEvent.change(textarea(), { target: { value: "é".repeat(4000) } });
    expect(saveButton().hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(patchProfile).toHaveBeenCalledTimes(1));
  });

  it("sets no maxLength, which would count UTF-16 units and not bytes", () => {
    renderEditor();
    expect(textarea().getAttribute("maxlength")).toBeNull();
  });

  it("reports a too-long bio in our words, never the server's '500 characters'", async () => {
    patchProfile.mockRejectedValue(
      new BccApiError("bcc_invalid_request", "Bio must be 500 characters or fewer.", 422, null),
    );
    renderEditor();
    fireEvent.change(textarea(), { target: { value: "way too long" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Your bio is too long. Shorten it and try again.");
    expect(alert.textContent).not.toMatch(/500/);
    expect(alert.textContent).not.toMatch(/characters/);
  });

  it("falls back to generic copy for an unmapped code, never err.message", async () => {
    patchProfile.mockRejectedValue(
      new BccApiError("bcc_teapot", "raw server prose that must not surface", 418, null),
    );
    renderEditor();
    fireEvent.change(textarea(), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Couldn't save your bio. Try again.");
  });
});

describe("arriving from BioBox's WRITE ONE link", () => {
  it("focuses the field and strips the parameter, keeping the tab", async () => {
    searchParams = new URLSearchParams("tab=profile&focus=bio");
    window.history.replaceState(null, "", "/u/welder?tab=profile&focus=bio");
    renderEditor();
    await waitFor(() => expect(document.activeElement).toBe(textarea()));
    // The tab strip rebuilds its query from window.location.search, so a
    // leftover focus=bio would re-fire on the next tab change.
    expect(window.location.search).toBe("?tab=profile");
  });

  it("does not steal focus when it was not asked to", () => {
    renderEditor();
    expect(document.activeElement).not.toBe(textarea());
  });
});

describe("accessibility", () => {
  it("labels the field and links its description", () => {
    renderEditor();
    const el = textarea();
    const describedBy = el.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")?.textContent).toMatch(
      /short introduction/,
    );
  });

  it("announces a failure once, via alert and not also the polite region", async () => {
    patchProfile.mockRejectedValue(new Error("network"));
    renderEditor();
    fireEvent.change(textarea(), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await screen.findByRole("alert");
    const polite = document.querySelector('[role="status"]');
    expect(polite?.textContent ?? "").toBe("");
  });
});
