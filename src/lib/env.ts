/**
 * env.ts — typed env-var loader.
 *
 * Reads the runtime env once and exposes a frozen object so that
 * mistyped accesses fail at compile time and the same value is read
 * everywhere. Server vs. client variables are separated explicitly.
 *
 * NEXT_PUBLIC_* values are inlined into the client bundle by Next.js;
 * everything else is server-only and we throw if the client tries to
 * read them.
 */

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(
      `[bcc-frontend] Missing required env var: ${name}. ` +
        `See .env.local.example for the canonical list.`
    );
  }
  return value;
}

/** Strip a single trailing slash, leave others alone. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export const clientEnv = Object.freeze({
  /** Backend base URL (no trailing slash). REST namespace lives at /wp-json/bcc/v1/*. */
  BCC_API_URL: stripTrailingSlash(
    required("NEXT_PUBLIC_BCC_API_URL", process.env["NEXT_PUBLIC_BCC_API_URL"])
  ),
});

/**
 * Server-only env. Throws when accessed in the browser bundle —
 * Next.js can usually catch this at build time, but the runtime
 * guard catches the rest.
 */
export const serverEnv = Object.freeze({
  get NEXTAUTH_URL(): string {
    if (typeof window !== "undefined") {
      throw new Error("[bcc-frontend] serverEnv accessed in client code");
    }
    return required("NEXTAUTH_URL", process.env["NEXTAUTH_URL"]);
  },
  get NEXTAUTH_SECRET(): string {
    if (typeof window !== "undefined") {
      throw new Error("[bcc-frontend] serverEnv accessed in client code");
    }
    return required("NEXTAUTH_SECRET", process.env["NEXTAUTH_SECRET"]);
  },
});
