/**
 * NextAuth module augmentation — typed User / Session / JWT shapes.
 *
 * Without this file, every read of `session.bccToken` or `token.handle`
 * requires a cast (the user's snippet used `(session as any).bccToken`).
 * Module-augmenting NextAuth here lets TypeScript enforce the shape end
 * to end — same strictness the PHP side gets from PHPStan level 8.
 *
 * Three places NextAuth surfaces the user identity, each gets the
 * BCC fields:
 *   - User       returned from authorize() in lib/auth.ts
 *   - JWT        the encrypted session JWT NextAuth signs (jwt callback)
 *   - Session    the object useSession() exposes to components
 */

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    /** The numeric WP user id, stringified (NextAuth convention). */
    id: string;
    /** §B6 BCC handle. Public identity. */
    handle: string;
    /** HS256 JWT minted by /auth/login or /auth/signup. */
    bccToken: string;
    /** Epoch milliseconds at which the BCC JWT (`bccToken`) expires. */
    bccTokenExpiresAt: number;
    /**
     * §I1 chrome signal — "Member in Good Standing" boolean resolved at
     * login from the user's reputation tier. Bounded-staleness V1:
     * carried through the JWT until next login.
     */
    inGoodStanding: boolean;
  }

  interface Session {
    user: {
      id: string;
      handle: string;
      /** Mirrors User.inGoodStanding; drives the SiteFooter stamp. */
      inGoodStanding: boolean;
      // Standard NextAuth fields stay optional in case we ever populate them.
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    /** The BCC API token attached to this session. Frontend sends as Bearer. */
    bccToken: string;
    /** Epoch milliseconds at which `bccToken` expires. */
    bccTokenExpiresAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    handle: string;
    bccToken: string;
    bccTokenExpiresAt: number;
    /** §I1 chrome signal — carried through the JWT until next login. */
    inGoodStanding: boolean;
  }
}
