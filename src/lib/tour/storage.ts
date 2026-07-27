/**
 * Tour persistence — the LOCAL layer of the two-tier store.
 *
 * Two distinct concerns, two stores:
 *
 *   - "seen" (localStorage `bcc-tour-seen`) — an append-only, monotonic
 *     set of tour ids the user has finished (or explicitly skipped). Once
 *     a tour is seen it is never un-seen. This is the durable, offline-safe
 *     mirror of the server's `bcc_tours_seen` user-meta; because both
 *     stores only ever ADD, and the effective answer is their UNION, the
 *     two can never conflict (see useToursSeen for the merge).
 *
 *   - "progress" (sessionStorage `bcc-tour-progress`) — the in-flight
 *     `{ tourId, step }` for the tour currently running. Session-scoped
 *     and NEVER synced to the server: mid-tour position is a per-tab
 *     concern, so there's no cross-device half-finished state to reconcile.
 *     It exists only so a cross-page (route-changing) step can resume
 *     after navigation.
 *
 * Every accessor is SSR-safe (typeof window guard) and defensive against
 * private-mode / quota errors (try/catch → sane fallback).
 */

const SEEN_KEY = "bcc-tour-seen";
const PROGRESS_KEY = "bcc-tour-progress";
const DISMISSED_KEY = "bcc-tour-dismissed";

export interface TourProgress {
  tourId: string;
  step: number;
}

// ── seen (localStorage) ──────────────────────────────────────────────

export function getLocalSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addLocalSeen(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = new Set(getLocalSeen());
    if (current.has(id)) return;
    current.add(id);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...current]));
  } catch {
    // Ignore — worst case the tour can re-show; harmless.
  }
}

export function clearLocalSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SEEN_KEY);
  } catch {
    // ignore
  }
}

// ── progress (sessionStorage) ────────────────────────────────────────

export function getProgress(): TourProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PROGRESS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as TourProgress).tourId === "string" &&
      typeof (parsed as TourProgress).step === "number"
    ) {
      return parsed as TourProgress;
    }
    return null;
  } catch {
    return null;
  }
}

export function setProgress(progress: TourProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

export function clearProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}

// ── session dismissal (sessionStorage) ───────────────────────────────
// A tour dismissed WITHOUT "don't show again" checked: suppressed for the
// rest of this browser session, then eligible to auto-start again next
// session. Distinct from the permanent, cross-device "seen" set.

export function isSessionDismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(id);
  } catch {
    return false;
  }
}

export function addSessionDismissed(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    const current = new Set<string>(
      raw !== null && Array.isArray(JSON.parse(raw) as unknown)
        ? (JSON.parse(raw) as string[])
        : [],
    );
    current.add(id);
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...current]));
  } catch {
    // ignore
  }
}
