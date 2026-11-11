import type { ReactNode } from "react";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `[x](//evil.example)` has no scheme, so safeUrlTransform keeps it as
 * "relative" — and the renderer then classed it INTERNAL via
 * `startsWith("/")`, emitting a same-tab next/link to another host. A
 * protocol-relative href must render as an external link (new tab,
 * noopener) like any other off-site URL. Root-relative paths stay
 * internal (the control).
 */

vi.mock("@/lib/shiki", () => ({
  getShiki: () => null,
  shikiReady: new Promise(() => undefined),
  highlightCode: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href} data-internal="true">
      {children}
    </a>
  ),
}));

import { BlogMarkdownRenderer } from "@/components/blog/markdown/BlogMarkdownRenderer";

afterEach(() => {
  cleanup();
});

describe("BlogMarkdownRenderer link classification", () => {
  it("renders a protocol-relative link as external, not an internal same-tab link", () => {
    const { container } = render(<BlogMarkdownRenderer body="[go](//evil.example/path)" />);
    const link = within(container).getByRole("link", { name: "go" });

    expect(link.getAttribute("data-internal")).toBeNull();
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("control: a root-relative path still renders as an internal link", () => {
    const { container } = render(<BlogMarkdownRenderer body="[me](/u/phillip)" />);
    const link = within(container).getByRole("link", { name: "me" });

    expect(link.getAttribute("data-internal")).toBe("true");
    expect(link.getAttribute("target")).toBeNull();
  });
});
