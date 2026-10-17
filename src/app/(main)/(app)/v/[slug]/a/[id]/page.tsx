/**
 * /v/[slug]/a/[id] — the canonical announcement page.
 *
 * This route owns the discussion. Feed cards and (in F2) the rotator
 * link here; neither hosts a thread of its own.
 *
 * Server component, two sequential reads:
 *   1. the validator Card — for the page id, the display name, and the
 *      §4.32 capability block that gates the whole feature;
 *   2. the announcement itself.
 *
 * Gating: if the Card carries no `announcements` block, the backend has
 * no announcements feature (true of every backend shipping today) and
 * this route 404s. That is the only gate — there is no client flag and
 * no environment toggle.
 *
 * A draft, a scheduled-not-due, or a published-but-unauthorized
 * announcement returns 404 from the API to non-owners rather than 403,
 * so its existence is never confirmed. We map that straight through.
 */

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { AnnouncementDetailView } from "@/components/announcements/AnnouncementDetailView";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getAnnouncement } from "@/lib/api/announcement-endpoints";
import { getCardEntity } from "@/lib/api/card-endpoints";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { BccApiError } from "@/lib/api/types";
import type { Card } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
}

/**
 * Resolve the validator card, or null when it or the announcements
 * feature is absent. Shared by the page and its metadata so both agree
 * on whether this route exists at all.
 */
async function loadValidatorCard(
  slug: string,
  token: string | null,
): Promise<Card | null> {
  try {
    const card = await getCardEntity(
      "validator",
      slug,
      token,
      token === null ? { revalidate: ANON_SSR_REVALIDATE_SECONDS } : undefined,
    );
    return card.announcements != null ? card : null;
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  const card = await loadValidatorCard(slug, token);
  if (card === null) {
    return { title: "Announcement" };
  }

  try {
    const announcement = await getAnnouncement(card.id, id, token);
    return {
      title: `${announcement.title} — ${card.name}`,
      // The summary is operator-written and required, so it is the right
      // description. The Markdown body never becomes metadata.
      description: announcement.summary,
    };
  } catch {
    // Metadata must never break the page; the route itself decides 404.
    return { title: "Announcement" };
  }
}

export default async function AnnouncementDetailPage({ params }: PageProps) {
  const { slug, id } = await params;
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  const card = await loadValidatorCard(slug, token);
  if (card === null) {
    notFound();
  }

  let announcement;
  try {
    announcement = await getAnnouncement(card.id, id, token);
  } catch (err) {
    if (err instanceof BccApiError && (err.status === 404 || err.status === 403)) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto mt-10 max-w-[1440px] px-4 pb-20 sm:px-7">
      <AnnouncementDetailView
        announcement={announcement}
        validatorName={card.name}
        viewerAuthed={session !== null}
      />
    </main>
  );
}
