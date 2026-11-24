/**
 * Member dates are private (Phillip, 2026-11-24). Other members must not
 * see WHEN someone verified a wallet, claimed a page, or joined a group
 * or team, and see account creation to the MONTH only ("Joined May 2026").
 *
 * The backend is about to drop or month-truncate those fields for other
 * viewers (`MemberProfile.joined_at`, `MemberSummary.joined_at`,
 * `GroupMember.joined_at`, a claim post's `verified_at`). The frontend
 * must be safe both now (fields present, full precision) and after
 * (absent or truncated), so:
 *   - `joined_at` is only ever read through formatJoinDate (month + year);
 *   - nothing computes an age ("3D AGO") from it — the profile's
 *     "JUST CLOCKED IN" frame that did is gone;
 *   - the feed never reads a post body's `verified_at`.
 * Claim posts keep their own post time, and group managers keep
 * "Asked 3d ago" / "Invited 3d ago" (main agent's call): not covered here.
 */

import { describe, expect, it } from "vitest";

import { formatJoinDate } from "@/lib/format";

import { isScript, isTestFile, sourceFiles } from "./source-tree.testing";

/** Code only: comments may still explain history. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const RUNTIME = sourceFiles().filter(
  (f) => isScript(f.rel) && !isTestFile(f.rel) && !f.rel.endsWith(".testing.ts"),
);

describe("formatJoinDate: month and year, never a day", () => {
  it("a full timestamp and a month-truncated one read the same month", () => {
    expect(formatJoinDate("2026-05-17T13:45:10Z")).toBe("MAY 2026");
    expect(formatJoinDate("2026-05-01T00:00:00Z")).toBe("MAY 2026");
    expect(formatJoinDate("2026-12-31T23:59:59Z")).toBe("DEC 2026");
  });

  it("the output is MON YYYY: no day, no time", () => {
    for (const iso of ["2026-05-17T13:45:10Z", "2026-01-09T08:00:00Z", "2025-11-30T00:00:00Z"]) {
      expect(formatJoinDate(iso)).toMatch(/^[A-Z]{3} \d{4}$/);
    }
  });

  it("absent or unreadable reads as the dash (callers then hide it)", () => {
    expect(formatJoinDate(undefined)).toBe("—");
    expect(formatJoinDate(null)).toBe("—");
    expect(formatJoinDate("")).toBe("—");
    expect(formatJoinDate("not a date")).toBe("—");
  });
});

describe("joined_at is only read through formatJoinDate", () => {
  it("every runtime read of joined_at is an argument to formatJoinDate", () => {
    const offenders: string[] = [];
    for (const f of RUNTIME) {
      // Type declarations (the fields themselves) live here.
      if (f.rel === "lib/api/types.ts") continue;
      const src = code(f.code);
      const re = /\bjoined_at\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        if (!/formatJoinDate\(\s*[\w.?]*$/.test(before)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${f.rel}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the profile computes no account age, and the 'JUST CLOCKED IN' frame is gone", () => {
    const page = RUNTIME.find((f) => f.rel === "app/(main)/(app)/u/[handle]/page.tsx");
    expect(page, "profile page not found").toBeDefined();
    const src = code(page?.code ?? "");
    for (const gone of ["JUST CLOCKED IN", "D AGO", "joinedAgeDays", "isColdOperator", "86_400_000"]) {
      expect(src, gone).not.toContain(gone);
    }
  });
});

describe("a post body's verified_at is never read", () => {
  it("nothing in the feed, post or share-card code reads verified_at", () => {
    const scoped = RUNTIME.filter((f) =>
      /^(components\/(feed|post|posts)\/|lib\/og\/|app\/\(main\)\/\(detail\)\/)/.test(f.rel),
    );
    expect(scoped.length).toBeGreaterThan(0);
    const readers = scoped.filter((f) => /\bverified_at\b/.test(code(f.code))).map((f) => f.rel);
    expect(readers).toEqual([]);
  });
});
