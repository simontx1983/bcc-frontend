import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CopyrightReportLink } from "./CopyrightReportLink";
import { UploadRightsReminder } from "./UploadRightsReminder";
import { LEGAL } from "@/lib/legal/config";

afterEach(cleanup);

describe("copyright reporting links", () => {
  it("identifies the source item without copying a URL query or fragment", () => {
    render(
      <CopyrightReportLink
        path="/post/feed_7?tracking=demo#unrelated"
        item="Comment image (comment_9)"
      />,
    );

    const href = screen.getByRole("link", { name: "Report a copyright concern" }).getAttribute("href");
    expect(href?.startsWith(`mailto:${LEGAL.legalEmail}?`)).toBe(true);
    expect(decodeURIComponent(href ?? "")).toContain(
      `Location: ${LEGAL.siteUrl}/post/feed_7\nItem: Comment image (comment_9)`,
    );
    expect(href).not.toContain("tracking");
    expect(href).not.toContain("unrelated");
  });

  it.each(["//elsewhere.example/photo", "/\\elsewhere.example/photo", "https://elsewhere.example/photo", "/\n/["])(
    "keeps unexpected report locations out of the email draft (%s)",
    (path) => {
      render(<CopyrightReportLink path={path} item="Post image" />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    },
  );

  it("shows the image rights reminder", () => {
    render(<UploadRightsReminder />);
    expect(screen.getByText("Only upload images you created or have permission to share.")).toBeVisible();
  });
});
