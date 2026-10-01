import { AuthRedirectNotice } from "@/components/auth/AuthRedirectNotice";
import { MinimalShell } from "@/components/layout/shells/MinimalShell";

/**
 * (auth) — sign-in / sign-up / recovery, under the minimal shell.
 *
 * `AuthRedirectNotice` is mounted here as well as in (main) because this
 * group is a LANDING TARGET for the session boundary, not just a place
 * people navigate to. `endSession({ callbackUrl: "/login" })` — used by
 * the password-change recovery path — lands here carrying its `authNotice`
 * slug, and (auth) is a sibling of (main), so the (main) mount cannot
 * cover it. Without this the explanation, including the push-notification
 * caveat, renders nowhere and the param is not even scrubbed.
 *
 * A route belongs to exactly one of the two groups, so there is still only
 * ever one instance mounted.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <MinimalShell>
      {children}
      <AuthRedirectNotice />
    </MinimalShell>
  );
}
