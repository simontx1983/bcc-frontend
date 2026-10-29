/**
 * The announcement bar.
 *
 * A strip that moves on its own is an accessibility hazard, so most of
 * what is pinned here is the *absence* of motion and noise: no interval
 * under reduced motion, no interval while hovered or focused, no polite
 * announcement during automatic rotation, and a real Pause control that
 * touch and screen-reader users can actually reach.
 *
 * Fake timers are used deliberately and narrowly — advanced inside
 * `act()` so React flushes the state update the interval schedules, and
 * restored after every test so a leaked timer cannot leak into the next.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Announcement } from "@/lib/api/types";
// Type-only: inline `import()` annotations are banned by the lint config.
import type * as AnnouncementEndpoints from "@/lib/api/announcement-endpoints";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const getAnnouncementRotator = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", async (orig) => {
  const actual = await orig<typeof AnnouncementEndpoints>();
  return {
    ...actual,
    getAnnouncementRotator: (...a: unknown[]) => getAnnouncementRotator(...a),
  };
});

const { AnnouncementBar, ROTATE_INTERVAL_MS } = await import(
  "@/components/announcements/AnnouncementBar"
);
const { PUBLISHED_ANNOUNCEMENT, SECOND_ANNOUNCEMENT, announcementListResponse } =
  await import("@/lib/announcements/fixtures");

let client: QueryClient;
/** Flipped per test to simulate the OS setting. */
let reducedMotion = false;

function makeItem(id: string, title: string, pinned = false): Announcement {
  return {
    ...SECOND_ANNOUNCEMENT,
    id,
    title,
    summary: `${title} summary`,
    is_pinned: pinned,
    links: { self: `/v/blacksmith-node/a/${id}` },
  };
}

const FIVE = [
  makeItem("ann_5", "Fifth", true),
  makeItem("ann_4", "Fourth"),
  makeItem("ann_3", "Third"),
  makeItem("ann_2", "Second"),
  makeItem("ann_1", "First"),
];

beforeEach(() => {
  vi.clearAllMocks();
  reducedMotion = false;
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduce") ? reducedMotion : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

function renderBar(featureEnabled = true) {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementBar pageId={1842} featureEnabled={featureEnabled} />
    </QueryClientProvider>,
  );
}

/** Advance the rotation clock inside act() so React flushes the update. */
async function tick(times = 1) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(ROTATE_INTERVAL_MS);
    });
  }
}

const slideTitle = () =>
  screen.getByTestId("announcement-slide").querySelector("h3")?.textContent;

// 1 ───────────────────────────────────────────────────────────────────
describe("feature block absent", () => {
  it("renders nothing and issues no request", async () => {
    const { container } = renderBar(false);
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    expect(getAnnouncementRotator).not.toHaveBeenCalled();
  });
});

// 2 ───────────────────────────────────────────────────────────────────
describe("zero results", () => {
  it("renders nothing rather than an empty frame", async () => {
    getAnnouncementRotator.mockResolvedValue(announcementListResponse([]));
    const { container } = renderBar();
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});

// 3 ───────────────────────────────────────────────────────────────────
describe("a single announcement", () => {
  it("renders statically, with no controls and no interval", async () => {
    vi.useFakeTimers();
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    );
    renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("announcement-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("announcement-bar-controls")).toBeNull();

    const before = slideTitle();
    await tick(3);
    expect(slideTitle()).toBe(before);
  });
});

// 4 + 5 ───────────────────────────────────────────────────────────────
describe("bounds and ordering", () => {
  it("renders only the first five of an over-long response", async () => {
    const six = [...FIVE, makeItem("ann_0", "Sixth")];
    getAnnouncementRotator.mockResolvedValue(announcementListResponse(six));
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar")).toBeInTheDocument();
    });
    expect(screen.getByTestId("announcement-bar-status")).toHaveTextContent(
      "Announcement 1 of 5",
    );
  });

  it("never re-sorts — it shows whatever the server put first", async () => {
    // Deliberately NOT in date order and NOT pinned-first: if the client
    // sorted at all, "Third" would not be the opening slide.
    const scrambled = [
      makeItem("ann_3", "Third"),
      makeItem("ann_5", "Fifth", true),
      makeItem("ann_1", "First"),
    ];
    getAnnouncementRotator.mockResolvedValue(announcementListResponse(scrambled));
    renderBar();
    await waitFor(() => {
      expect(slideTitle()).toBe("Third");
    });
  });
});

// 6 + 11 ──────────────────────────────────────────────────────────────
describe("automatic rotation", () => {
  it("advances after eight seconds and wraps past the last item", async () => {
    vi.useFakeTimers();
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(slideTitle()).toBe("Alpha");
    await tick();
    expect(slideTitle()).toBe("Beta");
    await tick();
    expect(slideTitle()).toBe("Alpha"); // wrapped
  });

  it("clears its interval on unmount", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(window, "clearInterval");
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    const view = renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    clearSpy.mockClear();
    view.unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

// 7 + 8 ───────────────────────────────────────────────────────────────
describe("pausing on interaction", () => {
  async function mountTwo() {
    vi.useFakeTimers();
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return screen.getByTestId("announcement-bar");
  }

  it("pauses on hover and resumes when the pointer leaves", async () => {
    const bar = await mountTwo();

    fireEvent.mouseEnter(bar);
    await tick(2);
    expect(slideTitle()).toBe("Alpha");

    fireEvent.mouseLeave(bar);
    await tick();
    expect(slideTitle()).toBe("Beta");
  });

  it("pauses while a descendant holds keyboard focus, and resumes on blur", async () => {
    const bar = await mountTwo();

    fireEvent.focus(screen.getByTestId("announcement-read-more"));
    await tick(2);
    expect(slideTitle()).toBe("Alpha");

    fireEvent.blur(bar);
    await tick();
    expect(slideTitle()).toBe("Beta");
  });

  it("pauses on touch", async () => {
    const bar = await mountTwo();
    fireEvent.touchStart(bar);
    await tick(2);
    expect(slideTitle()).toBe("Alpha");
  });
});

// 9 ───────────────────────────────────────────────────────────────────
describe("manual navigation", () => {
  async function mountThree() {
    vi.useFakeTimers();
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([
        makeItem("a", "Alpha"),
        makeItem("b", "Beta"),
        makeItem("c", "Gamma"),
      ]),
    );
    renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("stops rotation until the viewer explicitly resumes", async () => {
    await mountThree();
    fireEvent.click(screen.getByRole("button", { name: "Next announcement" }));
    expect(slideTitle()).toBe("Beta");

    // Blur so hover/focus pausing is not what is being measured.
    fireEvent.blur(screen.getByTestId("announcement-bar"));
    await tick(3);
    expect(slideTitle()).toBe("Beta"); // still paused

    fireEvent.click(screen.getByRole("button", { name: "Resume rotation" }));
    fireEvent.blur(screen.getByTestId("announcement-bar"));
    await tick();
    expect(slideTitle()).toBe("Gamma");
  });

  // 11 —
  it("wraps backwards from the first item to the last", async () => {
    await mountThree();
    fireEvent.click(screen.getByRole("button", { name: "Previous announcement" }));
    expect(slideTitle()).toBe("Gamma");
  });

  it("wraps forwards from the last item to the first", async () => {
    await mountThree();
    const next = screen.getByRole("button", { name: "Next announcement" });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(slideTitle()).toBe("Gamma");
    fireEvent.click(next);
    expect(slideTitle()).toBe("Alpha");
  });
});

// 10 ──────────────────────────────────────────────────────────────────
describe("reduced motion", () => {
  it("starts no interval and applies no transform", async () => {
    reducedMotion = true;
    vi.useFakeTimers();
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(slideTitle()).toBe("Alpha");
    await tick(4);
    expect(slideTitle()).toBe("Alpha");

    const track = screen.getByTestId("announcement-slide-track");
    expect(track).toHaveAttribute("data-animated", "false");
    expect(track.getAttribute("style")).toBeNull();
  });

  it("still offers manual navigation", async () => {
    reducedMotion = true;
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar-controls")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Next announcement" }));
    expect(slideTitle()).toBe("Beta");
  });
});

// 12 + 13 ─────────────────────────────────────────────────────────────
describe("live region", () => {
  it("stays silent through automatic rotation", async () => {
    vi.useFakeTimers();
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const status = screen.getByTestId("announcement-bar-status");
    expect(status).toHaveAttribute("aria-live", "off");
    await tick();
    expect(slideTitle()).toBe("Beta");
    // Content moved on, but nothing was announced.
    expect(screen.getByTestId("announcement-bar-status")).toHaveAttribute(
      "aria-live",
      "off",
    );
  });

  it("announces position and title after a manual change", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar-controls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Next announcement" }));
    const status = screen.getByTestId("announcement-bar-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Announcement 2 of 2: Beta");
  });

  it("does not duplicate the slide into the live region", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar")).toBeInTheDocument();
    });
    const status = screen.getByTestId("announcement-bar-status");
    // Position + title only — no summary, no date, no Read more.
    expect(status.textContent).toBe("Announcement 1 of 2: Alpha");
    expect(status.querySelector("a")).toBeNull();
  });
});

// 14 ──────────────────────────────────────────────────────────────────
describe("controls", () => {
  it("have accessible names and 44px targets", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar-controls")).toBeInTheDocument();
    });

    for (const name of ["Previous announcement", "Pause rotation", "Next announcement"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeInTheDocument();
      expect(button.getAttribute("style")).toContain("min-width: 44px");
      expect(button.getAttribute("style")).toContain("min-height: 44px");
    }
  });

  it("exposes the pause state to assistive tech", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar-controls")).toBeInTheDocument();
    });
    const pause = screen.getByRole("button", { name: "Pause rotation" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pause);
    expect(screen.getByRole("button", { name: "Resume rotation" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

// 15 ──────────────────────────────────────────────────────────────────
describe("Read more", () => {
  it("uses the server's link verbatim", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([
        { ...makeItem("a", "Alpha"), links: { self: "/v/some-node/a/weird-9001" } },
      ]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-read-more")).toBeInTheDocument();
    });
    expect(screen.getByTestId("announcement-read-more")).toHaveAttribute(
      "href",
      "/v/some-node/a/weird-9001",
    );
  });

  it("renders no body and no discussion in the bar", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-slide")).toBeInTheDocument();
    });
    const slide = screen.getByTestId("announcement-slide");
    expect(slide.textContent).not.toMatch(/What changed/);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

// 16 ──────────────────────────────────────────────────────────────────
describe("data refresh", () => {
  /**
   * Both of these assert on the STATUS line, not just the title, because
   * it carries "n of m" — which changes when the refetch lands. Asserting
   * only the title let the first version of this test pass without the
   * refetch ever arriving.
   */
  const status = () => screen.getByTestId("announcement-bar-status").textContent;

  it("keeps the viewer on the same announcement by id", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([
        makeItem("a", "Alpha"),
        makeItem("b", "Beta"),
        makeItem("c", "Gamma"),
      ]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar-controls")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Next announcement" }));
    expect(status()).toBe("Announcement 2 of 3: Beta");

    // Refetch drops one and reorders the rest. "2 of 2" can only be read
    // once the new set has actually landed.
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("c", "Gamma"), makeItem("b", "Beta")]),
    );
    await act(async () => {
      await client.refetchQueries();
    });
    await waitFor(() => {
      expect(status()).toBe("Announcement 2 of 2: Beta");
    });
    expect(slideTitle()).toBe("Beta");
  });

  it("falls back to the first item when the current one disappears", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("b", "Beta")]),
    );
    renderBar();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-bar-controls")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Next announcement" }));
    expect(status()).toBe("Announcement 2 of 2: Beta");

    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("a", "Alpha"), makeItem("z", "Zulu")]),
    );
    await act(async () => {
      await client.refetchQueries();
    });
    await waitFor(() => {
      expect(status()).toBe("Announcement 1 of 2: Alpha");
    });
    expect(slideTitle()).toBe("Alpha");
  });
});

// 17 ──────────────────────────────────────────────────────────────────
describe("fetch failure", () => {
  it("degrades to a compact retry without taking the page down", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    getAnnouncementRotator.mockRejectedValue(
      new BccApiError("bcc_internal_error", "raw server prose", 500, null),
    );
    render(
      <QueryClientProvider client={client}>
        <div>
          <AnnouncementBar pageId={1842} featureEnabled />
          <div data-testid="rest-of-profile">tabs and everything else</div>
        </div>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load announcements/)).toBeInTheDocument();
    });
    // The surrounding profile is untouched, and server prose never leaks.
    expect(screen.getByTestId("rest-of-profile")).toBeInTheDocument();
    expect(screen.queryByText(/raw server prose/)).toBeNull();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });
});
