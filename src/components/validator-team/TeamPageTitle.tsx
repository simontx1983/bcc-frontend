/**
 * The validator page a team screen belongs to, from the server's `page`.
 * Renders nothing when the server sent no title (older backend).
 */

import type { ValidatorTeamPageRef } from "@/lib/api/types";

export function TeamPageTitle({ page }: { page: ValidatorTeamPageRef | undefined }) {
  if (page === undefined || page.title.trim() === "") return null;
  return <p className="bcc-stencil text-2xl text-bcc-text">{page.title}</p>;
}
