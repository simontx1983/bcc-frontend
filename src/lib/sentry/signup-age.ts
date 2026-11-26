import type { Breadcrumb } from "@sentry/nextjs";

export function isSignupAgeRequest(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    return /\/auth\/age-eligibility\/?$/.test(new URL(url, "https://example.test").pathname);
  } catch {
    return false;
  }
}

/** The status of this first-party request reveals the eligibility outcome. */
export function filterSignupAgeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return isSignupAgeRequest(breadcrumb.data?.["url"]) ? null : breadcrumb;
}
