/**
 * NextAuth options — server-side credentials provider against /auth/login.
 *
 * Architecture:
 *   1. Login form posts email/password → signIn("credentials", ...)
 *   2. NextAuth invokes authorize() → calls bcc-trust /auth/login
 *   3. On 200 with envelope, return User { id, handle, bccToken }
 *   4. On non-2xx, throw Error("bcc_*") so signIn(...).error carries
 *      the specific code (NextAuth surfaces error.message verbatim
 *      when redirect:false). UI in login/page.tsx maps codes → copy.
 *   5. Returned User feeds the jwt callback → stored in the
 *      NextAuth-signed session JWT (separate from the BCC token).
 *   6. session callback exposes session.user + session.bccToken to
 *      every component via useSession().
 *
 * Why two JWTs (NextAuth session JWT + BCC bearer JWT)?
 *   The NextAuth session JWT is HttpOnly cookie-based, signed with
 *   NEXTAUTH_SECRET, and used to track *who is logged in to this app*.
 *   The BCC bearer JWT is what the WordPress backend accepts via
 *   `Authorization: Bearer`, signed with `wp_salt('auth')`. Storing
 *   the BCC token *inside* the NextAuth session keeps it out of
 *   localStorage (XSS-safer) and lets useSession() expose it.
 *
 * The authOptions object is exported separately so server components
 * (e.g. /onboarding) can do:
 *   const session = await getServerSession(authOptions);
 * without dragging the route handler into their bundle.
 */

import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { clientEnv } from "@/lib/env";
import type { ApiSuccess, AuthTokenResponse } from "@/lib/api/types";

/**
 * Shared POST handler for the credentials providers.
 *
 * Both the email and wallet providers POST a JSON body to a bcc-trust
 * `/auth/*` route that returns the same envelope-wrapped
 * AuthTokenResponse on success. Network/transport failure throws
 * `bcc_network_error`; non-2xx responses throw the server's
 * `error.code` verbatim (so the UI can map specific copy per code);
 * shape failures throw `bcc_invalid_envelope`. NextAuth surfaces the
 * thrown message back to the page as `signIn(...).error`.
 */
async function callBccAuth(
  url: string,
  body: Record<string, unknown>
): Promise<{
  id: string;
  handle: string;
  bccToken: string;
  bccTokenExpiresAt: number;
  inGoodStanding: boolean;
}> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("bcc_network_error");
  }

  const parsed = (await response.json().catch(() => null)) as
    | ApiSuccess<AuthTokenResponse>
    | { error?: { code?: string } }
    | null;

  if (!response.ok) {
    // Pass the server's actual error.code through verbatim so the UI
    // can map specific copy (bcc_rate_limited ≠ bcc_invalid_credentials,
    // bcc_wallet_not_linked ≠ bcc_signature_invalid, etc.). Fallback is
    // "bcc_unknown" — NOT a guessed-specific code — because pretending
    // we know what failed when we don't is worse than admitting we don't.
    const code =
      parsed && "error" in parsed && parsed.error?.code
        ? parsed.error.code
        : "bcc_unknown";
    throw new Error(code);
  }

  if (
    !parsed ||
    !("data" in parsed) ||
    typeof parsed.data.token !== "string" ||
    typeof parsed.data.user_id !== "number" ||
    typeof parsed.data.handle !== "string" ||
    typeof parsed.data.expires_in !== "number"
  ) {
    throw new Error("bcc_invalid_envelope");
  }

  // `in_good_standing` is required on the backend response shape per
  // AuthTokenResponse, but be defensive about absence so a backend that
  // hasn't deployed the field yet doesn't blow up the frontend during
  // a rolling deploy. Default to false (the more conservative default —
  // the SiteFooter stamp shows only when truthy).
  const inGoodStanding =
    typeof parsed.data.in_good_standing === "boolean"
      ? parsed.data.in_good_standing
      : false;

  return {
    id: String(parsed.data.user_id),
    handle: parsed.data.handle,
    bccToken: parsed.data.token,
    bccTokenExpiresAt: Date.now() + parsed.data.expires_in * 1000,
    inGoodStanding,
  };
}

export const authOptions: NextAuthOptions = {
  // JWT-strategy sessions — required for headless deploys where the
  // Next.js host doesn't share cookies with the WP origin.
  session: {
    strategy: "jwt",
  },

  // Custom sign-in / error pages live under app/login (we redirect
  // unauthed access there from server components).
  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim() ?? "";
        const password = credentials?.password ?? "";
        if (email === "" || password === "") {
          throw new Error("bcc_invalid_request");
        }

        return await callBccAuth(`${clientEnv.BCC_API_URL}/wp-json/bcc/v1/auth/login`, {
          email,
          password,
        });
      },
    }),

    // Wallet credentials provider — wallet IS the credential.
    // /auth/wallet-login on the backend verifies the signed challenge
    // anonymously and returns the same AuthTokenResponse shape as the
    // email provider, so the session-bridging path doesn't care which
    // route minted the JWT. The actual nonce + sign happens client-side
    // in <WalletAuthButton> before signIn("wallet", …) is called.
    //
    // The `extra` field is JSON-stringified at the call site because
    // NextAuth Credentials values are typed as strings — we re-parse
    // here. An empty string means no extra fields, not an error.
    Credentials({
      id: "wallet",
      name: "wallet",
      credentials: {
        wallet_address: { label: "Wallet Address", type: "text" },
        signature:      { label: "Signature",      type: "text" },
        extra:          { label: "Extra (JSON)",   type: "text" },
      },
      async authorize(credentials) {
        const walletAddress = credentials?.wallet_address?.trim() ?? "";
        const signature     = credentials?.signature ?? "";
        const extraRaw      = credentials?.extra ?? "";

        if (walletAddress === "" || signature === "") {
          throw new Error("bcc_invalid_request");
        }

        let extra: Record<string, unknown> = {};
        if (extraRaw !== "") {
          try {
            const parsed: unknown = JSON.parse(extraRaw);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
              extra = parsed as Record<string, unknown>;
            }
          } catch {
            throw new Error("bcc_invalid_request");
          }
        }

        return await callBccAuth(`${clientEnv.BCC_API_URL}/wp-json/bcc/v1/auth/wallet-login`, {
          wallet_address: walletAddress,
          signature,
          extra,
        });
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // First-call (right after authorize) — copy User fields onto JWT.
      if (user) {
        token.id = user.id;
        token.handle = user.handle;
        token.bccToken = user.bccToken;
        token.bccTokenExpiresAt = user.bccTokenExpiresAt;
        token.inGoodStanding = user.inGoodStanding;
      }

      // Subsequent calls — when the BCC JWT has expired, blank the
      // bccToken on the session so client code stops sending a stale
      // Bearer (every request would 401 otherwise). The NextAuth
      // session JWT may still be valid; emptying `bccToken` causes
      // bccFetchAsClient to send unauth'd, and protected endpoints
      // 401 with a typed error the route boundaries can redirect on.
      if (
        typeof token.bccTokenExpiresAt === "number" &&
        Date.now() >= token.bccTokenExpiresAt
      ) {
        token.bccToken = "";
      }

      return token;
    },

    async session({ session, token }) {
      // Project the JWT fields onto the session shape useSession() exposes.
      session.user = {
        ...session.user,
        id: token.id,
        handle: token.handle,
        inGoodStanding: token.inGoodStanding,
      };
      session.bccToken = token.bccToken;
      session.bccTokenExpiresAt = token.bccTokenExpiresAt;
      return session;
    },
  },
};
