/**
 * app-origin.ts — resolves this Next.js app's own canonical origin.
 *
 * Distinct from `clientEnv.BCC_API_URL`, which is the WordPress origin.
 * This is the origin the app advertises about ITSELF: `metadataBase`,
 * and through it every absolute Open Graph / Twitter-card image URL and
 * every canonical link on the site.
 *
 * Source order:
 *   1. NEXTAUTH_URL — the canonical URL of this app (already required by
 *      NextAuth). Correct in dev and in any deploy that sets it.
 *   2. Vercel system vars, mirroring Next's own resolver
 *      (packages/next/src/lib/metadata/resolvers/resolve-url.ts):
 *        - preview → VERCEL_BRANCH_URL || VERCEL_URL, the per-deployment
 *          host, which is genuinely what a preview should advertise.
 *        - otherwise → VERCEL_PROJECT_PRODUCTION_URL, the project's
 *          stable production domain.
 *      Both are hostname-only, so the scheme is prepended here.
 *   3. http://localhost:3000 — development only.
 *
 * Why not a plain VERCEL_URL fallback: VERCEL_URL is the EPHEMERAL
 * per-deployment host (`bcc-frontend-<hash>-<team>.vercel.app`). Using it
 * in production stamps a throwaway hostname into every og:image and
 * canonical on the site — wrong in a way nothing surfaces, because the
 * page still renders and the URL still resolves.
 *
 * Why production throws rather than falling back to localhost: OG tags
 * pointing at localhost are invisible in CI, invisible in smoke tests,
 * and discovered only when someone shares a link. A build failure is loud
 * and happens before any traffic. This matches the `required()` contract
 * in lib/env.ts, which already refuses to build without
 * NEXT_PUBLIC_BCC_API_URL.
 *
 * Reachability: on Vercel this never throws — VERCEL_PROJECT_PRODUCTION_URL
 * is always present. It fires only for a non-Vercel production build with
 * no NEXTAUTH_URL, which is a genuine misconfiguration.
 */
export function appOrigin(): string {
  const fromNextAuth = process.env["NEXTAUTH_URL"];
  if (fromNextAuth !== undefined && fromNextAuth !== "") {
    return fromNextAuth.replace(/\/$/, "");
  }

  if (process.env["VERCEL_ENV"] === "preview") {
    // Treat empty-string as absent, not as a value: `??` would accept a
    // set-but-empty VERCEL_BRANCH_URL and skip VERCEL_URL entirely,
    // silently dropping the preview through to the production branch.
    const branchHost = process.env["VERCEL_BRANCH_URL"];
    const deploymentHost = process.env["VERCEL_URL"];
    const previewHost =
      branchHost !== undefined && branchHost !== "" ? branchHost : deploymentHost;
    if (previewHost !== undefined && previewHost !== "") {
      return `https://${previewHost}`;
    }
  }

  const productionHost = process.env["VERCEL_PROJECT_PRODUCTION_URL"];
  if (productionHost !== undefined && productionHost !== "") {
    return `https://${productionHost}`;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  throw new Error(
    "[bcc-frontend] Cannot resolve the app's own origin for metadataBase. " +
      "Set NEXTAUTH_URL to this app's canonical URL (e.g. https://bluecollarcrypto.io). " +
      "Falling back to localhost in production would silently stamp every " +
      "og:image and canonical URL with an unreachable host."
  );
}
