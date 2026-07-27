import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TourProvider } from "@/components/tour/TourProvider";
import { clearLocalSeen, clearProgress, setProgress } from "@/lib/tour/storage";

/**
 * Keyboard-accessibility regression for the tour overlay (TourLayer).
 *
 * Two defects are pinned here:
 *   1. Enter must advance the tour EXACTLY once. The window keydown handler
 *      used to fire next() on Enter unconditionally, so Enter on the native
 *      "Next" <button> advanced TWICE (native onClick + window handler).
 *   2. The aria-modal dialog must trap Tab focus inside the popover instead
 *      of letting it escape to the dimmed page behind it.
 *
 * jsdom limitation (documented per-test): jsdom does NOT synthesise a native
 * `click` from Enter on a <button>, and it does NOT move focus on a Tab
 * keydown. So:
 *   - The Enter double-advance cases assert the handler's GUARD directly
 *     (Enter with an interactive activeElement does not advance) and then
 *     simulate the button's own onClick to prove the single-advance contract.
 *   - The focus-trap cases assert the handler's explicit focus management for
 *     the wrap / recovery boundaries (which is exactly what the code owns).
 */

const hoisted = vi.hoisted(() => ({
  reducedMotion: { value: false },
  pushMock: vi.fn(),
  getToursSeen: vi.fn(async () => ({ seen: [] as string[] })),
  markTourSeen: vi.fn(async (id: string) => ({ seen: [id] })),
}));

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => hoisted.reducedMotion.value,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: hoisted.pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api/tours-endpoints", () => ({
  getToursSeen: (...args: unknown[]) => hoisted.getToursSeen(...(args as [])),
  markTourSeen: (id: string) => hoisted.markTourSeen(id),
}));

// Registry tour used by the harness: "home-feed" (5 steps; step 0 is a
// centered intro card — the non-interactive tour surface).
const TOUR_ID = "home-feed";
const TOTAL = 5;

function renderTourAtStep(step: number) {
  setProgress({ tourId: TOUR_ID, step });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TourProvider>
        <button data-testid="outside-page-control">outside</button>
      </TourProvider>
    </QueryClientProvider>,
  );
}

async function startTourAtStep(step: number) {
  renderTourAtStep(step);
  // TourProvider resumes from sessionStorage in a mount effect.
  await screen.findByRole("checkbox");
}

function pop(): HTMLElement | null {
  return document.querySelector(".bcc-tour-pop");
}

function progressText(): string {
  return document.querySelector(".bcc-tour-pop-progress")?.textContent ?? "";
}

function pressKey(key: string, opts: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }),
    );
  });
}

function focusables(): HTMLElement[] {
  const root = pop();
  if (root === null) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

describe("TourLayer keyboard accessibility", () => {
  beforeEach(() => {
    hoisted.reducedMotion.value = false;
    hoisted.pushMock.mockClear();
    hoisted.getToursSeen.mockClear();
    hoisted.markTourSeen.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearLocalSeen();
    clearProgress();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Defect 1: Enter advances exactly once ──────────────────────────────

  it("1. Enter on the focused Next button advances exactly one step (not two)", async () => {
    // MECHANISM: jsdom won't synthesise the button's native click from Enter,
    // so (a) prove the window handler does NOT advance while an interactive
    // control is focused, then (b) fire the button's own onClick to prove the
    // single, sole advance. In a real browser only (b) fires from one Enter.
    await startTourAtStep(0);
    expect(progressText()).toContain(`1 / ${TOTAL}`);

    const next = screen.getByRole("button", { name: /next/i });
    next.focus();
    expect(document.activeElement).toBe(next);

    // (a) Enter while Next is focused: window handler must NOT advance.
    pressKey("Enter");
    expect(progressText()).toContain(`1 / ${TOTAL}`);

    // (b) The control's own activation advances once.
    fireEvent.click(next);
    expect(progressText()).toContain(`2 / ${TOTAL}`);
  });

  it("2. Enter from the non-interactive tour surface advances exactly one step", async () => {
    await startTourAtStep(0);
    const container = pop();
    expect(container).not.toBeNull();

    (container as HTMLElement).focus();
    expect(document.activeElement).toBe(container);

    pressKey("Enter");
    expect(progressText()).toContain(`2 / ${TOTAL}`);
  });

  it("3. Enter on the \"Don't show again\" checkbox does NOT advance the tour", async () => {
    await startTourAtStep(0);
    const checkbox = screen.getByRole("checkbox");
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);

    pressKey("Enter");
    expect(progressText()).toContain(`1 / ${TOTAL}`);
  });

  // ── Defect 2: Tab focus trap ───────────────────────────────────────────

  it("4. Tab wraps from the last eligible control to the first", async () => {
    await startTourAtStep(0);
    const controls = focusables();
    const first = controls.at(0);
    const last = controls.at(-1);
    if (first === undefined || last === undefined) throw new Error("expected focusable controls");
    expect(controls.length).toBeGreaterThan(1);

    last.focus();
    pressKey("Tab");
    expect(document.activeElement).toBe(first);
  });

  it("5. Shift+Tab wraps from the first eligible control to the last", async () => {
    await startTourAtStep(0);
    const controls = focusables();
    const first = controls.at(0);
    const last = controls.at(-1);
    if (first === undefined || last === undefined) throw new Error("expected focusable controls");

    first.focus();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("6. Focus is recovered into the dialog if it escapes while modal is active", async () => {
    await startTourAtStep(0);
    const outside = screen.getByTestId("outside-page-control");
    outside.focus();
    expect(document.activeElement).toBe(outside);

    pressKey("Tab");
    // Pulled back to the first focusable inside the popover.
    expect(document.activeElement).toBe(focusables()[0]);
  });

  // ── Preserved existing behaviour ───────────────────────────────────────

  it("7. Escape still dismisses the tour (marks it seen and closes)", async () => {
    await startTourAtStep(0);
    expect(pop()).not.toBeNull();

    pressKey("Escape");

    expect(pop()).toBeNull();
    // Default "don't show again" is ON, so Escape marks the tour seen. The
    // server write-through fires on a microtask via React Query.
    await waitFor(() => expect(hoisted.markTourSeen).toHaveBeenCalledWith(TOUR_ID));
  });

  it("8. Skip and Finish still mark the tour seen", async () => {
    // Skip (the Dismiss button).
    await startTourAtStep(0);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(pop()).toBeNull();
    await waitFor(() => expect(hoisted.markTourSeen).toHaveBeenCalledWith(TOUR_ID));

    cleanup();
    hoisted.markTourSeen.mockClear();
    window.localStorage.clear();
    clearLocalSeen();

    // Finish (Done on the last step).
    await startTourAtStep(TOTAL - 1);
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(pop()).toBeNull();
    await waitFor(() => expect(hoisted.markTourSeen).toHaveBeenCalledWith(TOUR_ID));
  });

  it("9. Back and Next advance/retreat exactly one step and clamp at the ends", async () => {
    // Normal advance + retreat around a middle step.
    await startTourAtStep(1);
    expect(progressText()).toContain(`2 / ${TOTAL}`);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(progressText()).toContain(`3 / ${TOTAL}`);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(progressText()).toContain(`2 / ${TOTAL}`);

    cleanup();
    // Clamp at the start: ArrowLeft on the first step is a no-op.
    await startTourAtStep(0);
    expect(progressText()).toContain(`1 / ${TOTAL}`);
    pressKey("ArrowLeft");
    expect(progressText()).toContain(`1 / ${TOTAL}`);
    // ArrowRight still advances.
    pressKey("ArrowRight");
    expect(progressText()).toContain(`2 / ${TOTAL}`);
  });

  it("10. Reduced-motion behaviour remains intact (transitions suppressed)", async () => {
    // Reduced ON: the overlay drops its transition.
    hoisted.reducedMotion.value = true;
    await startTourAtStep(0);
    const overlayReduced = document.querySelector(".bcc-tour-overlay") as HTMLElement;
    expect(overlayReduced.style.transition).toBe("none");

    cleanup();

    // Reduced OFF: no inline transition override (CSS animation path intact).
    hoisted.reducedMotion.value = false;
    await startTourAtStep(0);
    const overlayNormal = document.querySelector(".bcc-tour-overlay") as HTMLElement;
    expect(overlayNormal.style.transition).toBe("");
  });
});
