#!/usr/bin/env node
/**
 * dev-clean.mjs — idempotent "seal" run before `next dev` (predev hook).
 *
 * Why this exists: on Windows, pressing Ctrl+C on `npm run dev` answers the
 * "Terminate batch job (Y/N)?" prompt by killing the npm/cmd wrapper but
 * ORPHANS the `next dev` node child. That orphan keeps `.next/trace` open, so
 * the next launch crashes with:
 *   Error: EPERM: operation not permitted, open '...\.next\trace'
 *
 * This script kills any orphaned next-dev process belonging to THIS project
 * and removes the stale `.next/trace` lock, so `next dev` always starts clean.
 *
 * Safe to run every time and twice in a row: with nothing stale it matches no
 * processes and finds no trace file, then exits 0. It never throws — a cleanup
 * step must never block the dev server.
 *
 * No dependencies (node: builtins only).
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRACE_FILE = join(PROJECT_ROOT, ".next", "trace");

// Identify our process by two stable substrings in its command line: the
// project root and Next's dev entrypoint. Scoping to PROJECT_ROOT means we
// never touch Local-by-Flywheel, the WP toolchain, or unrelated node apps —
// even ones on the same port.
const ROOT_NEEDLE = PROJECT_ROOT.toLowerCase();
const ENTRY_NEEDLE = "start-server.js";

let killed = 0;

function killWindows() {
  // tasklist won't give command lines, so use CIM. Single quotes ONLY inside
  // the PowerShell command (delimiter '||') so the whole thing survives being
  // wrapped in double quotes through cmd.exe — embedded double quotes break the
  // quoting and the scan silently returns nothing.
  const ps =
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } " +
    "| ForEach-Object { ($_.ProcessId.ToString() + '||' + $_.CommandLine) }";
  let out = "";
  try {
    out = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps}"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch {
    return; // no node processes / powershell unavailable
  }
  for (const line of out.split(/\r?\n/)) {
    const sep = line.indexOf("||");
    if (sep === -1) continue;
    const pid = line.slice(0, sep).trim();
    const cmd = line.slice(sep + 2).toLowerCase();
    if (!pid || pid === String(process.pid)) continue;
    if (cmd.includes(ROOT_NEEDLE) && cmd.includes(ENTRY_NEEDLE)) {
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
        console.log(`[dev-clean] killed orphaned next-dev (pid ${pid})`);
        killed++;
      } catch {
        /* already gone */
      }
    }
  }
}

function killPosix() {
  let out = "";
  try {
    // -ww = unlimited width so command lines aren't truncated.
    out = execSync("ps -axww -o pid=,command=", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return;
  }
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = m[1];
    const cmd = m[2].toLowerCase();
    if (pid === String(process.pid)) continue;
    if (cmd.includes(ROOT_NEEDLE) && cmd.includes(ENTRY_NEEDLE)) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
        console.log(`[dev-clean] killed orphaned next-dev (pid ${pid})`);
        killed++;
      } catch {
        /* already gone */
      }
    }
  }
}

try {
  if (process.platform === "win32") killWindows();
  else killPosix();
} catch (err) {
  console.log(`[dev-clean] process scan skipped: ${err?.message ?? err}`);
}

// Clear the stale lock. force:true => missing file is a no-op. If a legitimate
// live server still holds it, there is no stale lock to clear anyway.
let removedTrace = false;
try {
  rmSync(TRACE_FILE, { force: true });
  removedTrace = true; // rmSync(force) doesn't report whether a file existed
} catch {
  /* held by a live process — nothing stale to clear */
}

if (killed === 0 && removedTrace) {
  // We can't cheaply tell "removed an existing trace" from "nothing was there",
  // so keep the message honest and quiet.
  console.log("[dev-clean] nothing to clean");
}

// Cleanup must never block `next dev`.
process.exit(0);
