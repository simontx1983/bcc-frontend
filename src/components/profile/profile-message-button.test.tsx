import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://x" } }));

import { ProfileMessageButton } from "./ProfileMessageButton";

afterEach(cleanup);

describe("ProfileMessageButton (Message entry on the redesigned profile)", () => {
  it("allowed → a Message link to the composer for this member", () => {
    render(
      <ProfileMessageButton
        permissions={{ can_message: { allowed: true } }}
        recipientId={42}
        recipientName="Alice"
      />,
    );
    const link = screen.getByRole("link", { name: "Message Alice" });
    expect(link.getAttribute("href")).toBe("/messages/new?to_user=42");
  });

  it("denied with no hint → nothing at all", () => {
    const { container } = render(
      <ProfileMessageButton
        permissions={{ can_message: { allowed: false } }}
        recipientId={42}
        recipientName="Alice"
      />,
    );
    expect(container.querySelector("a, button")).toBeNull();
  });
});
