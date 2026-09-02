/**
 * HandleSection — the handle, shown but not editable.
 *
 * Replaces IdentitySettingsForm. Handle editing is TEMPORARILY DISABLED by
 * owner decision after a cross-codebase trace found that a rename leaves
 * the account in a broken state the frontend cannot repair or even
 * truthfully describe:
 *
 *   - `/u/{old-handle}` 404s permanently. `UserSlugResolver::resolve` tries
 *     `bcc_handle` (overwritten), then `user_login` (which is `u_<handle>`,
 *     never a bare handle), then `user_nicename` — but only when
 *     `sanitize_title($slug) !== $slug`, which is false for every §B6-shaped
 *     handle. All three miss.
 *
 *   - The signed-in session keeps the OLD handle. `token.handle` is written
 *     only at sign-in, and the `trigger === "update"` branch in auth.ts
 *     deliberately ignores it, so `router.refresh()` cannot fix it. Until
 *     the user signs out and back in, `/u/me`, SiteHeader, LeftSidebar,
 *     MainOffcanvas, /watching, /me/progression and /me/reliability all
 *     point at the dead handle.
 *
 *   - Signing in with the NEW handle fails. `OnboardingEndpoint::updateHandle`
 *     writes only `bcc_handle` + `bcc_handle_last_changed`; `user_login` is
 *     minted once at signup as `'u_' . $handle` and never synced, and
 *     `do_action('bcc_handle_changed')` has no listener. Only the ORIGINAL
 *     signup handle or the email address authenticates — and after two
 *     renames the frontend does not know what that original handle was, so
 *     no warning we could write here would be accurate.
 *
 * A confirmation dialog cannot make that safe, so the control is withdrawn
 * rather than dressed up. See the deferred backend project: old-handle
 * reservation, 301 redirects, canonical handling, login by current handle,
 * and session refresh must all land before this becomes an editor again.
 *
 * The frontend mutation path was DELETED rather than left dormant: the
 * `useUpdateHandle` hook and the `updateHandle` wrapper over
 * `PATCH /me/handle` are gone. Keeping unreachable code to save future
 * typing does not justify an exception to the dead-file guard, and the
 * backend repair may well need a different frontend contract than the one
 * that was there. The backend endpoint itself is untouched.
 */

interface HandleSectionProps {
  handle: string;
}

export function HandleSection({ handle }: HandleSectionProps) {
  return (
    <div className="bcc-panel p-6">
      <p className="bcc-mono text-[11px] tracking-[0.16em] text-bcc-text-secondary">
        Your handle is your unique profile address:
      </p>
      <p className="mt-2 flex flex-wrap items-baseline font-serif text-bcc-text">
        <span className="bcc-mono text-bcc-text-secondary">
          bluecollarcrypto.io/u/
        </span>
        <span className="bcc-mono text-bcc-text">{handle}</span>
      </p>
      <p className="mt-4 border-t border-dashed border-bcc-border pt-4 font-serif text-[15px] text-bcc-text-secondary">
        Handle changes are temporarily unavailable while we make sure profile
        links and sign-in continue to work safely.
      </p>
    </div>
  );
}
