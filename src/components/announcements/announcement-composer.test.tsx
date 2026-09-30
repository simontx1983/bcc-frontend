/**
 * The composer: three modes, a required summary, and a future-only date.
 *
 * Client-side checks here are UX. The server is the authority on every
 * one of them — it stamps publication time from its own clock, refuses
 * backdating, and re-resolves ownership before anything goes public. So
 * these tests assert the composer does not SEND obviously-invalid input,
 * never that it is the thing keeping bad input out.
 *
 * The summary assertions are the ones that matter most: summary is a
 * first-class product requirement, deliberately not derived from the
 * body, so "the form let it through empty" is a real regression.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Type-only: erased at compile time, so it is safe above the vi.mock calls.
import type { CreateAnnouncementRequest } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const { AnnouncementComposer } = await import(
  "@/components/announcements/AnnouncementComposer"
);

type SubmitMock = ReturnType<typeof vi.fn<(request: CreateAnnouncementRequest) => Promise<unknown>>>;

let onSubmit: SubmitMock;
let onClose: () => void;

beforeAll(() => {
  // jsdom has no matchMedia; Dialog reads it through usePrefersReducedMotion.
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
  onSubmit = vi.fn<(request: CreateAnnouncementRequest) => Promise<unknown>>(
    async () => undefined,
  );
  onClose = () => {};
});

afterEach(cleanup);

function renderComposer(pending = false, error: unknown = null) {
  return render(
    <AnnouncementComposer
      onClose={onClose}
      onSubmit={onSubmit}
      pending={pending}
      error={error}
    />,
  );
}

function fill(fields: { title?: string; summary?: string; body?: string }) {
  if (fields.title !== undefined) {
    fireEvent.change(screen.getByLabelText("TITLE"), { target: { value: fields.title } });
  }
  if (fields.summary !== undefined) {
    fireEvent.change(screen.getByLabelText("SUMMARY (REQUIRED)"), {
      target: { value: fields.summary },
    });
  }
  if (fields.body !== undefined) {
    fireEvent.change(screen.getByLabelText("BODY (MARKDOWN)"), {
      target: { value: fields.body },
    });
  }
}

function submitButton() {
  return screen.getByRole("button", { name: /SAVE DRAFT|PUBLISH|SCHEDULE/ });
}

describe("summary is required and independently validated", () => {
  it("blocks submission when the summary is empty but title and body are fine", () => {
    renderComposer();
    fill({ title: "Upgrade complete", summary: "", body: "Some body copy." });
    expect(submitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submission when the summary is only whitespace", () => {
    renderComposer();
    fill({ title: "Upgrade complete", summary: "   ", body: "Some body copy." });
    expect(submitButton()).toBeDisabled();
  });

  it("enables submission once a real summary is present", () => {
    renderComposer();
    fill({ title: "Upgrade complete", summary: "We upgraded.", body: "Some body copy." });
    expect(submitButton()).toBeEnabled();
  });

  it("caps the summary at the contract length", () => {
    renderComposer();
    expect(screen.getByLabelText("SUMMARY (REQUIRED)")).toHaveAttribute("maxlength", "300");
  });

  it("never derives the summary from the body", () => {
    renderComposer();
    fill({ title: "T", summary: "", body: "A long body that could be auto-summarised." });
    // If anything were deriving a summary, the field would be non-empty
    // and the button enabled. Both must stay put.
    expect(screen.getByLabelText("SUMMARY (REQUIRED)")).toHaveValue("");
    expect(submitButton()).toBeDisabled();
  });
});

describe("publication modes", () => {
  it("defaults to publish-now", () => {
    renderComposer();
    expect(screen.getByRole("radio", { name: "Publish now" })).toBeChecked();
    expect(screen.getByRole("button", { name: "PUBLISH" })).toBeInTheDocument();
  });

  it("sends mode=draft with no publish_at", () => {
    renderComposer();
    fill({ title: "T", summary: "S", body: "B" });
    fireEvent.click(screen.getByRole("radio", { name: "Save as draft" }));
    fireEvent.click(screen.getByRole("button", { name: "SAVE DRAFT" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "draft", title: "T", summary: "S", body: "B" }),
    );
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("publish_at");
  });

  it("sends mode=publish with no publish_at", () => {
    renderComposer();
    fill({ title: "T", summary: "S", body: "B" });
    fireEvent.click(screen.getByRole("button", { name: "PUBLISH" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mode: "publish" }));
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("publish_at");
  });

  it("reveals the date field only in schedule mode", () => {
    renderComposer();
    expect(screen.queryByLabelText("PUBLICATION TIME")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Schedule for later" }));
    expect(screen.getByLabelText("PUBLICATION TIME")).toBeInTheDocument();
  });
});

describe("scheduling is future-only", () => {
  it("blocks a schedule with no date chosen", () => {
    renderComposer();
    fill({ title: "T", summary: "S", body: "B" });
    fireEvent.click(screen.getByRole("radio", { name: "Schedule for later" }));
    expect(screen.getByRole("button", { name: "SCHEDULE" })).toBeDisabled();
  });

  it("blocks a past date — announcements cannot be backdated", () => {
    renderComposer();
    fill({ title: "T", summary: "S", body: "B" });
    fireEvent.click(screen.getByRole("radio", { name: "Schedule for later" }));
    fireEvent.change(screen.getByLabelText("PUBLICATION TIME"), {
      target: { value: "2020-01-01T09:00" },
    });
    expect(screen.getByRole("button", { name: "SCHEDULE" })).toBeDisabled();
  });

  it("accepts a future date and sends it as UTC ISO", () => {
    renderComposer();
    fill({ title: "T", summary: "S", body: "B" });
    fireEvent.click(screen.getByRole("radio", { name: "Schedule for later" }));

    const future = new Date(Date.now() + 86_400_000);
    // datetime-local wants local wall-clock with no zone.
    const pad = (n: number) => String(n).padStart(2, "0");
    const local =
      `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}` +
      `T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    fireEvent.change(screen.getByLabelText("PUBLICATION TIME"), {
      target: { value: local },
    });

    const button = screen.getByRole("button", { name: "SCHEDULE" });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    const sent = onSubmit.mock.calls[0]?.[0] as { mode: string; publish_at?: string };
    expect(sent.mode).toBe("schedule");
    expect(sent.publish_at).toMatch(/Z$/);
    expect(Date.parse(sent.publish_at ?? "")).toBeGreaterThan(Date.now());
  });
});

describe("comments toggle", () => {
  it("defaults to allowing comments and sends the operator's choice", () => {
    renderComposer();
    fill({ title: "T", summary: "S", body: "B" });
    const toggle = screen.getByRole("checkbox", { name: "Allow comments" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "PUBLISH" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ comments_enabled: false }),
    );
  });
});

describe("accessibility and in-flight behaviour", () => {
  it("is a labelled modal dialog", () => {
    renderComposer();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "New announcement");
  });

  it("disables every input while a submission is in flight", () => {
    renderComposer(true);
    expect(screen.getByLabelText("TITLE")).toBeDisabled();
    expect(screen.getByLabelText("SUMMARY (REQUIRED)")).toBeDisabled();
    expect(screen.getByLabelText("BODY (MARKDOWN)")).toBeDisabled();
    expect(screen.getByRole("button", { name: /CANCEL/ })).toBeDisabled();
  });

  it("surfaces a failure as an alert, keyed on code and not server prose", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    renderComposer(
      false,
      new BccApiError("bcc_forbidden", "raw server prose", 403, null),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/not the verified operator/);
    expect(alert).not.toHaveTextContent(/raw server prose/);
  });
});
