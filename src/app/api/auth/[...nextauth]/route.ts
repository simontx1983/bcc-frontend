/**
 * NextAuth route handler (App Router).
 *
 * Stays deliberately thin — all config lives in @/lib/auth.ts so
 * server components can import authOptions without dragging this
 * route handler into their bundle.
 */

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
