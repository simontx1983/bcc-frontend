import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * bcc-trust F-288: a 401 on a route that requires sign-in can carry
 * `bcc_token_expired` / `bcc_token_invalid` instead of `bcc_unauthorized`.
 * Sign-in copy goes through humanizeCode, which maps both onto a call
 * site's `bcc_unauthorized` entry. A direct `code === "bcc_unauthorized"`
 * comparison would silently miss them, so none may come back.
 */
describe("no direct bcc_unauthorized comparisons in app code", () => {
  it("routes sign-in copy through humanizeCode", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
          if (/code\s*===\s*["']bcc_unauthorized["']/.test(readFileSync(full, "utf8"))) {
            offenders.push(full);
          }
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
    // A whole-tree walk: generous timeout for a loaded CI box.
  }, 30_000);
});
