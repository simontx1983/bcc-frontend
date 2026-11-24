/**
 * ProfileFieldsList — the Yes/No radios and the multi-select chips are named
 * by their field's label. Each option otherwise announced only itself
 * ("Yes", "Welding"), never the question it answered: the row label's
 * `htmlFor` points at `field-<key>`, which no radio or checkbox carries.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const idleMutation = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };

const FIELDS = {
  fields: [
    {
      key: "union",
      label: "Union member",
      help_text: null,
      type: "select_bool",
      value: "1",
      visibility: "public",
      visibility_locked: false,
      editable: true,
      required: false,
      max_length: null,
      options: null,
      order: 1,
    },
    {
      key: "crafts",
      label: "Crafts",
      help_text: null,
      type: "select_multi",
      value: ["weld"],
      visibility: "public",
      visibility_locked: false,
      editable: true,
      required: false,
      max_length: null,
      options: [
        { value: "weld", label: "Welding" },
        { value: "pipe", label: "Pipefitting" },
      ],
      order: 2,
    },
  ],
  stats: { filled: 2, total: 2, completeness: 100 },
};

vi.mock("@/hooks/useProfileFields", () => ({
  useProfileFields: () => ({
    data: FIELDS,
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateProfileFieldValue: () => idleMutation,
  useUpdateProfileFieldVisibility: () => idleMutation,
  profileFieldValuesEqual: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
}));
vi.mock("@/hooks/useDirtyRegistration", () => ({ useDirtyRegistration: () => undefined }));
vi.mock("@/components/settings/SettingsSaveStatus", () => ({ SettingsSaveStatus: () => null }));
vi.mock("@/lib/api/profile-fields-endpoints", () => ({}));

import { ProfileFieldsList } from "@/components/settings/profile/ProfileFieldsList";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("ProfileFieldsList — option groups carry the field's name", () => {
  it("the Yes/No radios are a radiogroup named by the field label", () => {
    render(<ProfileFieldsList />);
    const group = screen.getByRole("radiogroup", { name: /UNION MEMBER/ });
    expect(within(group).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Yes",
      "No",
    ]);
  });

  it("the multi-select chips are a group named by the field label", () => {
    render(<ProfileFieldsList />);
    const group = screen.getByRole("group", { name: /CRAFTS/ });
    const boxes = within(group).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(within(group).getByRole("checkbox", { name: "Welding" })).toBeChecked();
    expect(within(group).getByRole("checkbox", { name: "Pipefitting" })).not.toBeChecked();
  });
});
