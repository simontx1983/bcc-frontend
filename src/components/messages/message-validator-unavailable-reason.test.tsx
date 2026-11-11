/**
 * F-99: `can_message.reason_code: "unavailable"` (blocks couldn't be
 * checked) omits the validator Message button entirely: no disabled
 * button and no hint, whatever the destination or hint.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { MessageValidatorButton } from "@/components/messages/MessageValidatorButton";
import type { CardPermissions } from "@/lib/api/types";

afterEach(cleanup);

const perms = (can_message: unknown) => ({ can_message }) as unknown as CardPermissions;

describe("MessageValidatorButton — reason_code 'unavailable'", () => {
  it.each(["queue", "operator"] as const)("renders nothing for destination %s", (destination) => {
    const { container } = render(
      <MessageValidatorButton
        pageId={7}
        permissions={perms({ allowed: false, unlock_hint: "Try again later.", reason_code: "unavailable" })}
        messaging={{ destination } as never}
      />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(/message/i)).toBeNull();
    expect(screen.queryByText("Try again later.")).toBeNull();
  });

  it("control: sender_chat_disabled with a hint still renders the disabled button", () => {
    render(
      <MessageValidatorButton
        pageId={7}
        permissions={perms({ allowed: false, unlock_hint: "Turn on your DMs.", reason_code: "sender_chat_disabled" })}
        messaging={{ destination: "operator" } as never}
      />,
    );
    expect(screen.getByRole("button", { name: "Message Operator" })).toBeDisabled();
  });
});
