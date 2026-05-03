"use client";

/**
 * MembersGrid — card grid for the /members directory.
 *
 * One card per MemberSummary: avatar + display_name + handle kicker +
 * tier/rank chips + good-standing dot. Click anywhere on the card →
 * /u/:handle for the full profile.
 *
 * Visually mirrors the entity DirectoryGrid rhythm so the two
 * directories feel like the same product — same paper-card treatment,
 * same column count breakpoints.
 */

import Link from "next/link";

import type { MemberSummary } from "@/lib/api/types";

interface MembersGridProps {
  items: readonly MemberSummary[];
}

export function MembersGrid({ items }: MembersGridProps) {
  if (items.length === 0) {
    return null; // page-level empty state handles this
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((member) => (
        <li key={member.id}>
          <MemberCard member={member} />
        </li>
      ))}
    </ul>
  );
}

function MemberCard({ member }: { member: MemberSummary }) {
  const href = `/u/${member.handle}` as const;

  return (
    <Link
      href={href}
      className="bcc-paper group flex h-full flex-col gap-3 p-4 transition hover:bg-cardstock-deep/30"
    >
      <header className="flex items-center gap-3">
        <Avatar src={member.avatar_url} initial={member.handle.charAt(0).toUpperCase()} />
        <div className="min-w-0 flex-1">
          <p className="bcc-mono truncate text-safety">@{member.handle}</p>
          <h3 className="bcc-stencil truncate text-lg text-ink leading-tight">
            {member.display_name}
          </h3>
        </div>
      </header>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-dashed border-cardstock-edge/40 pt-3">
        {member.tier_label !== null && (
          <span
            className="bcc-mono bg-weld text-ink px-2 py-[3px]"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            {member.tier_label.toUpperCase()}
          </span>
        )}
        {member.rank_label !== "" && (
          <span
            className="bcc-mono bg-cardstock-deep text-ink px-2 py-[3px]"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            {member.rank_label.toUpperCase()}
          </span>
        )}
        {member.is_in_good_standing ? (
          <span
            className="bcc-mono bg-verified px-2 py-[3px] text-white"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            title="In good standing"
          >
            ✓
          </span>
        ) : (
          <span
            className="bcc-mono border border-safety/60 px-2 py-[3px] text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            title="Under review"
          >
            !
          </span>
        )}
      </div>
    </Link>
  );
}

function Avatar({ src, initial }: { src: string; initial: string }) {
  if (src === "") {
    return (
      <div
        aria-hidden
        className="bcc-stencil flex h-12 w-12 shrink-0 items-center justify-center border-2 border-cardstock-edge/40 bg-cardstock-deep/40 text-2xl text-ink"
      >
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={48}
      height={48}
      className="h-12 w-12 shrink-0 border-2 border-cardstock-edge/40 object-cover"
    />
  );
}
