/**
 * /me/progression — §N11 standing page (PR-11b reshape from "climb").
 *
 * Thin wrapper around `<StandingFileBody>`. The body component is the
 * single source of truth for the operator-file surface; this page
 * adds the hero + FileRail so direct navigation lands on a fully-
 * framed destination. The same body component also renders inside
 * the Setup tab STANDING sub-tab on `/u/[handle]`.
 *
 * Server component. Reuses `getUser(ownHandle, token)` — the §3.1
 * contract already ships the own-only `progression` + `wallets` +
 * `verifications` blocks when the handle matches the session.
 *
 * Visibility: signed-in only. Anonymous viewers redirect to
 * `/login?callbackUrl=/me/progression`.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { StandingFileBody } from "@/components/profile/StandingFileBody";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/api/user-endpoints";

export default async function ProgressionPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/me/progression");
  }

  const profile = await getUser(session.user.handle, session.bccToken);

  return (
    <main className="pb-24">
      <FileRail handle={profile.handle} />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">YOUR FILE</p>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Standing.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep">
          What the floor reads on you. Identity signals, current
          grade, and reputation moves over time.
        </p>
      </header>

      <div className="px-7">
        <StandingFileBody profile={profile} />
      </div>
    </main>
  );
}

function FileRail({ handle }: { handle: string }) {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>OPERATOR &nbsp;//&nbsp; STANDING</span>
          <span className="text-cardstock">@{handle.toUpperCase()}</span>
        </span>
        <span className="bcc-mono text-cardstock/50">
          FILE 0002 &nbsp;//&nbsp; YOUR FILE
        </span>
      </div>
    </div>
  );
}
