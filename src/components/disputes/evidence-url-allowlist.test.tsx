/**
 * A dispute's evidence_url is user-supplied, so it only becomes a link
 * when its scheme passes the blog markdown allowlist (http, https,
 * mailto, or relative). Anything else (javascript:, data:, …) renders as
 * text. Also pins two small fixes in the same change: the login page
 * never puts the 2FA challenge token in the URL, and Crest invalidates
 * the real useUser key.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CaseBody } from "@/components/disputes/CaseBody";
import type { Dispute } from "@/lib/api/types";

const dispute = (evidence_url: string): Dispute => ({
  id: 1,
  vote_id: 2,
  page_id: 3,
  page_title: "Atlas",
  voter_name: "voter",
  reporter_name: "reporter",
  reason: "The downvote cites the wrong epoch.",
  evidence_url,
  status: "reviewing",
  created_at: "2026-11-10T12:00:00Z",
  resolved_at: null,
});

afterEach(cleanup);

describe("CaseBody — evidence link scheme allowlist", () => {
  it("an https evidence URL is a link", () => {
    render(<CaseBody dispute={dispute("https://example.com/proof")} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/proof");
  });

  for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)"]) {
    it(`"${bad.split(":")[0]}:" is shown as text, never as a link`, () => {
      render(<CaseBody dispute={dispute(bad)} />);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText((t) => t.includes(bad))).toBeInTheDocument();
    });
  }

  it("no evidence still says NO EXHIBIT FILED", () => {
    render(<CaseBody dispute={dispute("")} />);
    expect(screen.getByText("NO EXHIBIT FILED")).toBeInTheDocument();
  });
});

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("source guards", () => {
  it("MyDisputesList links evidence only through the allowlist", () => {
    const src = read("src/components/disputes/MyDisputesList.tsx");
    expect(src).toContain("safeUrlTransform(dispute.evidence_url)");
    expect(src).not.toMatch(/href=\{dispute\.evidence_url\}/);
  });

  it("the login page never builds a ?ct= URL", () => {
    const src = read("src/app/(auth)/login/LoginPageClient.tsx");
    expect(src).toContain("stashChallengeToken(resp.challenge_token)");
    expect(src).not.toMatch(/\bct:\s*resp\.challenge_token/);
  });

  it("NextAuth has no email/password provider driving /auth/login server-side (F-132)", () => {
    const src = read("src/lib/auth.ts");
    expect(src).not.toMatch(/name:\s*"credentials"/);
    expect(src).not.toMatch(/\/wp-json\/bcc\/v1\/auth\/login`/);
    // The two providers that remain.
    expect(src).toMatch(/id:\s*"bcc-verified"/);
    expect(src).toMatch(/id:\s*"wallet"/);
  });

  it("Crest invalidates the useUser key, not a key nothing uses", () => {
    const crest = read("src/components/cards/Crest.tsx");
    expect(read("src/hooks/useUser.ts")).toMatch(/queryKey:\s*\["user",\s*handle\]/);
    expect(crest).toContain('invalidateQueries({ queryKey: ["user"] })');
    expect(crest).not.toContain('"user-by-handle"');
  });
});
