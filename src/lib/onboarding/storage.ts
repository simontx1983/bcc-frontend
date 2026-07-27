/**
 * Onboarding step-progress persistence — the local half of "resume
 * setup?" (task 7, `_handovers/HANDOVER-onboarding-tour-followups.md`).
 * Mirrors `lib/tour/storage.ts`'s pattern: localStorage now, an optional
 * server-meta mirror can follow later the same way tour "seen" did.
 *
 * Single concern: the furthest/most-recent step the wizard was on. It is
 * NOT the same thing as onboarding-completion (`bcc_onboarding_completed`,
 * server-owned) — this is purely "where would resuming pick up," cleared
 * the moment the wizard reaches its send-off screen.
 *
 * Every accessor is SSR-safe (typeof window guard) and defensive against
 * private-mode / quota errors (try/catch → sane fallback), same posture
 * as the tour store.
 */

const PROGRESS_KEY = "bcc-onboarding-progress";
const RESUME_DISMISSED_KEY = "bcc-onboarding-resume-dismissed";

export interface OnboardingProgress {
  step: string;
  updatedAt: number;
}

export function getOnboardingProgress(): OnboardingProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as OnboardingProgress).step === "string" &&
      typeof (parsed as OnboardingProgress).updatedAt === "number"
    ) {
      return parsed as OnboardingProgress;
    }
    return null;
  } catch {
    return null;
  }
}

export function setOnboardingProgress(step: string): void {
  if (typeof window === "undefined") return;
  try {
    const progress: OnboardingProgress = { step, updatedAt: Date.now() };
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore — worst case resume isn't offered; harmless.
  }
}

export function clearOnboardingProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}

// ── resume-prompt dismissal ──────────────────────────────────────────
// "Skip" on the resume prompt is a standing choice, not a per-session
// snooze (unlike the tour system's session-dismiss) — the visitor said
// they don't want to finish, so the floating icon shouldn't return.

export function isResumeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RESUME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissResume(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RESUME_DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}
