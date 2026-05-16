/**
 * /me/reliability — §J.5 self-mirror surface.
 *
 * Thin wrapper around `<ReliabilityMirrorBody>`. The body component
 * is the single source of truth for the self-mirror surface; this
 * page adds the hero + FileRail. The same body component also
 * renders inside the Setup tab RELIABILITY sub-tab on `/u/[handle]`.
 *
 * Server component. Signed-in only.
 *
 * §2.7 status-anxiety mitigation: the page intentionally lacks any
 * call-to-action that says "you haven't attested in N days" or
 * "cast more to climb." Cadence-pressure is the failure mode the
 * design protects against; the page is information, not a nudge.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReliabilityMirrorBody } from "@/components/profile/ReliabilityMirrorBody";
import { authOptions } from "@/lib/auth";
import { getMeReliability } from "@/lib/api/me-reliability-endpoints";

export default async function ReliabilityPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/me/reliability" as Route);
  }

  const reliability = await getMeReliability(session.bccToken);
  const handle = session.user.handle;

  return (
    <main className="pb-24">
      <FileRail handle={handle} />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">YOUR MIRROR</p>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Reliability.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep">
          How the floor reads your track record as a judge of other
          operators. Not how others read you — that&rsquo;s your
          reputation. This is the inverse: when you back someone,
          does the floor agree later?
        </p>
      </header>

      <div className="px-7">
        <ReliabilityMirrorBody reliability={reliability} />
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
          <span>OPERATOR &nbsp;//&nbsp; RELIABILITY</span>
          <span className="text-cardstock">@{handle.toUpperCase()}</span>
        </span>
        <span className="bcc-mono text-cardstock/50">
          FILE 0003 &nbsp;//&nbsp; YOUR MIRROR
        </span>
      </div>
    </div>
  );
}
