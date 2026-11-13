/**
 * EditAboutForm — staged edits, one diffed save.
 *
 *   - SAVE CHANGES is disabled until a staged value differs from the server
 *   - Save PATCHes only the fields that changed (prefs and bio separately)
 *   - Cancel drops the staged buffer
 *   - each card's pill is bound to its own pref; absent pref = shown
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberHall, MemberProfile } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));

const api = vi.hoisted(() => ({
  getProfilePrefs: vi.fn(),
  patchProfilePrefs: vi.fn(),
  patchProfile: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/profile-prefs-endpoints", () => ({
  getProfilePrefs: () => api.getProfilePrefs(),
  patchProfilePrefs: (body: unknown) => api.patchProfilePrefs(body),
}));
vi.mock("@/lib/api/profile-endpoints", () => ({
  patchProfile: (body: unknown) => api.patchProfile(body),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  uploadCover: vi.fn(),
  deleteCover: vi.fn(),
  patchCoverPosition: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  useSearchParams: () => null,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const { EditAboutForm } = await import("./EditAboutForm");

const BASE_PREFS = {
  profile_visibility: "public",
  post_visibility: "members",
  hide_birthday_year: false,
  hide_online: false,
  hide_from_search: false,
  default_post_audience: "public",
};

const VERIFICATIONS: MemberProfile["verifications"] = {
  x_verified: true,
  x_username: "alice_x",
  github_verified: false,
  github_username: null,
  wallets_verified: 1,
  profile_completeness: 80,
} as MemberProfile["verifications"];

const HALLS = [
  { id: 1, slug: "builders", name: "Builders Hall", type: "hall", role_label: "Moderator" },
] as unknown as MemberHall[];

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  api.patchProfilePrefs.mockImplementation(async (body: Record<string, unknown>) => ({
    ...BASE_PREFS,
    ...body,
  }));
  api.patchProfile.mockImplementation(async (body: { bio: string }) => ({ bio: body.bio.trim() }));
});
afterEach(() => {
  cleanup();
  client.clear();
});

function renderForm(prefs: Record<string, unknown> = BASE_PREFS) {
  api.getProfilePrefs.mockResolvedValue(prefs);
  return render(
    <QueryClientProvider client={client}>
      <EditAboutForm
        handle="alice"
        bio="Original bio"
        verifications={VERIFICATIONS}
        halls={HALLS}
        blogTotal={3}
        reviewTotal={4}
      />
    </QueryClientProvider>,
  );
}

function pill(container: HTMLElement, section: string) {
  return within(container).getByRole("switch", { name: `Show on profile: ${section}` });
}

async function loaded(container: HTMLElement) {
  await waitFor(() => expect(pill(container, "Halls")).not.toBeDisabled());
}

const saveButton = (c: HTMLElement) => within(c).getByRole("button", { name: "Save changes" });
const cancelButton = (c: HTMLElement) => within(c).getByRole("button", { name: "Cancel" });

describe("EditAboutForm", () => {
  it("absent prefs read as shown; a stored false reads as hidden", async () => {
    const { container } = renderForm({ ...BASE_PREFS, show_blogs_on_profile: false });
    await loaded(container);
    for (const section of ["Your bio", "Verifications", "Halls", "Operator / Projects", "reviews you wrote"]) {
      expect(pill(container, section)).toHaveAttribute("aria-checked", "true");
    }
    expect(pill(container, "Blogs")).toHaveAttribute("aria-checked", "false");
  });

  it("Save stays disabled until something changes, and again once it is changed back", async () => {
    const { container } = renderForm();
    await loaded(container);
    expect(saveButton(container)).toBeDisabled();

    fireEvent.click(pill(container, "Halls"));
    expect(saveButton(container)).toBeEnabled();

    fireEvent.click(pill(container, "Halls"));
    expect(saveButton(container)).toBeDisabled();
  });

  it("saves ONLY the changed prefs, each to its own field, and leaves the bio alone", async () => {
    const { container } = renderForm();
    await loaded(container);

    fireEvent.click(pill(container, "Halls"));
    fireEvent.click(pill(container, "Your bio"));
    fireEvent.click(pill(container, "reviews you wrote"));
    fireEvent.click(saveButton(container));

    await waitFor(() => expect(api.patchProfilePrefs).toHaveBeenCalledTimes(1));
    // Halls → the existing v1.127 switch; YOUR BIO → the About section's
    // single switch (DETAILS would share it); Reviews → the §K2 inverse.
    expect(api.patchProfilePrefs).toHaveBeenCalledWith({
      show_groups_on_profile: false,
      show_about_on_profile: false,
      show_reviews_on_profile: false,
    });
    expect(api.patchProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(saveButton(container)).toBeDisabled());
    expect(pill(container, "Halls")).toHaveAttribute("aria-checked", "false");
  });

  it("a bio-only edit PATCHes the bio and never the prefs", async () => {
    const { container } = renderForm();
    await loaded(container);

    const textarea = within(container).getByLabelText("Your bio");
    fireEvent.change(textarea, { target: { value: "  New bio  " } });
    fireEvent.click(saveButton(container));

    await waitFor(() => expect(api.patchProfile).toHaveBeenCalledWith({ bio: "  New bio  " }));
    expect(api.patchProfilePrefs).not.toHaveBeenCalled();
    // The server's sanitised copy becomes the new baseline.
    await waitFor(() => expect(textarea).toHaveValue("New bio"));
    expect(saveButton(container)).toBeDisabled();
  });

  it("Cancel drops every staged edit", async () => {
    const { container } = renderForm();
    await loaded(container);

    fireEvent.click(pill(container, "Verifications"));
    const textarea = within(container).getByLabelText("Your bio");
    fireEvent.change(textarea, { target: { value: "Draft" } });
    expect(saveButton(container)).toBeEnabled();

    fireEvent.click(cancelButton(container));
    expect(textarea).toHaveValue("Original bio");
    expect(pill(container, "Verifications")).toHaveAttribute("aria-checked", "true");
    expect(saveButton(container)).toBeDisabled();
    expect(api.patchProfilePrefs).not.toHaveBeenCalled();
    expect(api.patchProfile).not.toHaveBeenCalled();
  });

  it("pills stay disabled until the prefs have loaded", () => {
    api.getProfilePrefs.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <QueryClientProvider client={client}>
        <EditAboutForm
          handle="alice"
          bio=""
          verifications={VERIFICATIONS}
          halls={[]}
          blogTotal={0}
          reviewTotal={undefined}
        />
      </QueryClientProvider>,
    );
    expect(pill(container, "Halls")).toBeDisabled();
  });

  it("never shows a wallet address; reconnect links go to account settings", async () => {
    const { container } = renderForm();
    await loaded(container);
    const card = within(container).getByTestId("edit-card-verifications");
    expect(card.textContent).toContain("Your wallet address is never shown.");
    expect(card.textContent).not.toMatch(/0x/);
    const links = within(card).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Reconnect", "Re-verify"]);
    for (const link of links) expect(link).toHaveAttribute("href", "/u/me?tab=account");
  });

  it("Operator add-links carry the claim return path; Halls show role labels verbatim", async () => {
    const { container } = renderForm();
    await loaded(container);
    const operator = within(container).getByTestId("edit-card-operator");
    const ret = encodeURIComponent("/u/alice/about/edit");
    expect(within(operator).getByRole("link", { name: "+ Add a validator" })).toHaveAttribute(
      "href",
      `/validators?claim=1&return=${ret}`,
    );
    const halls = within(container).getByTestId("edit-card-halls");
    expect(within(halls).getByTestId("membership-role").textContent).toBe("Moderator");
    expect(halls.textContent).toContain("Roles are set by each Hall.");
  });
});
