/**
 * Switching composer tabs (Update ↔ Review) asks before it drops a draft.
 *
 * Switching tabs unmounts the current form, so a written review (or
 * status) vanished silently. Now, with a draft, the switch asks
 * "Discard this draft?" (DISCARD / KEEP EDITING); with none it switches
 * straight away.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "4242", handle: "alice" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const { Composer } = await import("@/components/composer/Composer");

let qc: QueryClient;

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
});
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  qc.clear();
});

const prompt = () => screen.queryByRole("dialog", { name: "Discard this draft?" });
const tab = (name: RegExp) => screen.getByRole("tab", { name });

function openReview(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={qc}>
      <Composer
        variant="modal"
        defaultMode="review"
        reviewTargetId={35}
        reviewTargetName="Fixture Validator"
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

const textarea = () => document.querySelector("textarea") as HTMLTextAreaElement;

describe("composer tab switch", () => {
  it("with nothing written, switches straight away", () => {
    openReview();
    fireEvent.click(tab(/update/i));
    expect(prompt()).toBeNull();
    expect(tab(/update/i)).toHaveAttribute("aria-selected", "true");
  });

  it("with a draft, asks first; KEEP EDITING stays on the tab with the text", () => {
    openReview();
    fireEvent.change(textarea(), { target: { value: "Solid uptime all quarter." } });
    fireEvent.click(tab(/update/i));

    const confirm = prompt();
    expect(confirm).not.toBeNull();
    fireEvent.click(within(confirm as HTMLElement).getByRole("button", { name: "KEEP EDITING" }));

    expect(prompt()).toBeNull();
    expect(tab(/review/i)).toHaveAttribute("aria-selected", "true");
    expect(textarea().value).toBe("Solid uptime all quarter.");
  });

  it("DISCARD switches tabs; the dialog can then close without another prompt", () => {
    const { onClose } = openReview();
    fireEvent.change(textarea(), { target: { value: "Solid uptime all quarter." } });
    fireEvent.click(tab(/update/i));
    fireEvent.click(within(prompt() as HTMLElement).getByRole("button", { name: "DISCARD" }));

    expect(tab(/update/i)).toHaveAttribute("aria-selected", "true");
    expect(textarea().value).toBe("");

    fireEvent.keyDown(textarea(), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Discard this post?" })).toBeNull();
  });

  it("a chosen grade alone counts as a draft", () => {
    openReview();
    fireEvent.click(screen.getByRole("button", { name: /TRUST/ }));
    fireEvent.click(tab(/update/i));
    expect(prompt()).not.toBeNull();
  });
});
