/**
 * The announcements bar stays at the very top of the page, so it must not
 * arrive late: inserting ~h-28 above the heading pushes the whole page down.
 *
 * It also must not reserve that strip on the majority of pages, which have
 * no announcements at all. `card.announcements.has_any` is what tells the
 * two apart, and these are the true and false halves of it.
 */

import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rotator = vi.hoisted(() => ({ state: { isPending: true, data: undefined } as unknown }));

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_BCC_API_URL: "http://x" } }));
vi.mock("@/lib/api/client", () => ({ bccFetchAsClient: vi.fn(), bccFetch: vi.fn() }));
vi.mock("@/hooks/useAnnouncements", () => ({
  useAnnouncementRotator: () => rotator.state,
  useCreateAnnouncement: () => ({ isPending: false, error: null, reset: vi.fn(), mutate: vi.fn() }),
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("@/components/announcements/AnnouncementComposer", () => ({
  AnnouncementComposer: () => <div />,
}));

const { AnnouncementsTopSection } = await import(
  "@/components/announcements/AnnouncementsTopSection"
);

const DENIED = { allowed: false, unlock_hint: null, reason_code: null };
const caps = { can_create: DENIED, can_manage: DENIED } as never;

afterEach(cleanup);

describe("announcements top section — reserving the bar's height", () => {
  it("reserves the space while loading when the page HAS announcements", () => {
    render(<AnnouncementsTopSection pageId={7} capabilities={caps} hasAny />);

    // The skeleton branch renders the labelled section, so the height is
    // held and the heading below it does not move when the bar arrives.
    expect(screen.getByLabelText("Announcements")).toBeTruthy();
  });

  it("reserves NOTHING while loading when the page has none", () => {
    render(<AnnouncementsTopSection pageId={7} capabilities={caps} hasAny={false} />);

    expect(screen.queryByLabelText("Announcements")).toBeNull();
  });

  it("reserves nothing when the backend omits has_any", () => {
    // An older backend sends no `has_any`; EntityProfile passes `?? false`
    // and the prop itself defaults to false, so behaviour is unchanged.
    render(<AnnouncementsTopSection pageId={7} capabilities={caps} />);

    expect(screen.queryByLabelText("Announcements")).toBeNull();
  });
});
