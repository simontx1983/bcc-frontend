"use client";

/**
 * SearchResultsTab — renders one vertical's result list for /search.
 *
 * Wraps a UseQueryResult and dispatches to the right row component
 * based on `kind`. Owns the four visible states:
 *   - loading  → skeleton rows (DirectoryGrid idiom, narrower)
 *   - error    → bcc-panel error tile (mirrors DirectoryGrid:122)
 *   - empty    → "No matches" tile
 *   - results  → list of rows
 *
 * The "all" tab is composed in the parent (SearchResultsPage)
 * because it interleaves three queries; this component handles a
 * single homogeneous list.
 */

import type { Route } from "next";
import NextImage from "next/image";
import Link from "next/link";
import { memo, useMemo } from "react";

import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { isWpMediaUrl } from "@/lib/media";

import type {
  GroupSearchResult,
  ProjectSearchResult,
  UserSearchResult,
} from "@/lib/api/types";

interface BaseTabProps {
  query: string;
  isLoading: boolean;
  isError: boolean;
}

interface ProjectsTabProps extends BaseTabProps {
  kind: "projects";
  results: ProjectSearchResult[];
}

interface UsersTabProps extends BaseTabProps {
  kind: "users";
  results: UserSearchResult[];
}

interface GroupsTabProps extends BaseTabProps {
  kind: "groups";
  results: GroupSearchResult[];
}

export type SearchResultsTabProps =
  | ProjectsTabProps
  | UsersTabProps
  | GroupsTabProps;

const SKELETON_COUNT = 5;

export function SearchResultsTab(props: SearchResultsTabProps) {
  if (props.isError) return <ErrorTile />;
  if (props.isLoading) return <SkeletonList />;
  if (props.results.length === 0) return <EmptyTile query={props.query} />;

  if (props.kind === "projects") {
    return (
      <ul className="flex flex-col gap-2">
        {props.results.map((row) => (
          <li key={`project-${row.page_id}`}>
            <ProjectRow row={row} />
          </li>
        ))}
      </ul>
    );
  }

  if (props.kind === "users") {
    return (
      <ul className="flex flex-col gap-2">
        {props.results.map((row) => (
          <li key={`user-${row.id}`}>
            <UserRow row={row} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {props.results.map((row) => (
        <li key={`group-${row.id}`}>
          <GroupRow row={row} />
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// State tiles
// ─────────────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <ul
      aria-label="Loading search results"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: SKELETON_COUNT }).map((_, idx) => (
        <li
          key={idx}
          aria-hidden
          className={SKELETON_CLASS + " h-16"}
        />
      ))}
    </ul>
  );
}

function ErrorTile() {
  return (
    <div className="bcc-panel mx-auto max-w-md p-6 text-center">
      <p className="bcc-mono text-safety">SEARCH UNAVAILABLE</p>
      <p className="mt-3 font-serif text-sm text-bcc-text-secondary">
        That vertical hit a snag. Try a different filter or refresh in a moment.
      </p>
    </div>
  );
}

function EmptyTile({ query }: { query: string }) {
  return (
    <div className="bcc-panel mx-auto max-w-md p-8 text-center">
      <p className="bcc-mono text-safety">NO MATCHES</p>
      <h2 className="bcc-stencil mt-2 text-2xl text-bcc-text">
        Nothing found for &ldquo;{query}&rdquo;.
      </h2>
      <p className="mt-3 font-serif leading-relaxed text-bcc-text-secondary">
        Try a different keyword or switch tabs.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row components (one per vertical)
//
// Avatars: if the server returned a URL, use a plain <img> (the avatars
// come from arbitrary external hosts — PeepSo, Gravatar, IPFS — so a
// next/image loader configured for those hosts would just add latency
// without a benefit). Otherwise render a single-letter initial tile.
// ─────────────────────────────────────────────────────────────────────

export const ProjectRow = memo(function ProjectRow({ row }: { row: ProjectSearchResult }) {
  return (
    <Link
      href={row.page_url as Route}
      className="bcc-panel flex items-center gap-3 px-4 py-3 hover:bg-cardstock-deep motion-safe:transition motion-safe:duration-bcc-fast"
    >
      <Avatar src={row.avatar_url} name={row.page_name} shape="circle" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="bcc-stencil truncate text-sm text-bcc-text">
            {row.page_name}
          </span>
          {/* Claim-verified checkmark (§ verified-wins) — server-resolved
              boolean, distinct from email verification. */}
          {row.is_claim_verified && <VerifiedBadge />}
        </span>
        <span className="bcc-mono truncate text-[10px] text-cardstock-deep">
          {[row.category, row.tier !== null ? `TIER · ${row.tier}` : null]
            .filter((s): s is string => s !== null && s !== "")
            .join(" · ")
            .toUpperCase()}
        </span>
      </div>
      {row.tier !== null && row.tier !== "" && <TierBadge tier={row.tier} />}
    </Link>
  );
});

export const UserRow = memo(function UserRow({ row }: { row: UserSearchResult }) {
  return (
    <Link
      href={row.profile_url as Route}
      className="bcc-panel flex items-center gap-3 px-4 py-3 hover:bg-cardstock-deep motion-safe:transition motion-safe:duration-bcc-fast"
    >
      <Avatar src={row.avatar_url} name={row.display_name || row.username} shape="circle" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="bcc-stencil truncate text-sm text-bcc-text">
          {row.display_name || row.username}
        </span>
        <span className="bcc-mono truncate text-[10px] text-cardstock-deep">
          @{row.username}
        </span>
      </div>
    </Link>
  );
});

export const GroupRow = memo(function GroupRow({ row }: { row: GroupSearchResult }) {
  return (
    <Link
      href={row.group_url as Route}
      className="bcc-panel flex items-center gap-3 px-4 py-3 hover:bg-cardstock-deep motion-safe:transition motion-safe:duration-bcc-fast"
    >
      <Avatar src={row.avatar_url} name={row.name} shape="square" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="bcc-stencil truncate text-sm text-bcc-text">{row.name}</span>
        <span className="bcc-mono truncate text-[10px] text-cardstock-deep">
          /{row.slug}
        </span>
        {row.description !== null && row.description !== "" && (
          <span className="truncate font-serif text-[11px] text-bcc-text-secondary">
            {row.description}
          </span>
        )}
      </div>
    </Link>
  );
});

// ─────────────────────────────────────────────────────────────────────
// Shared row primitives
// ─────────────────────────────────────────────────────────────────────

function Avatar({
  src,
  name,
  shape,
}: {
  src: string | null;
  name: string;
  shape: "circle" | "square";
}) {
  const initial = useMemo(() => {
    const trimmed = name.trim();
    return trimmed === "" ? "?" : trimmed.charAt(0).toUpperCase();
  }, [name]);
  const radius = shape === "circle" ? "rounded-full" : "rounded-sm";
  if (src !== null && src !== "") {
    // WP-hosted avatars (PeepSo uploads) ride Vercel's image CDN;
    // arbitrary external hosts (Gravatar, IPFS) keep the raw <img> —
    // they're outside the next/image allowlist (see lib/media.ts).
    if (isWpMediaUrl(src)) {
      return (
        <NextImage
          src={src}
          alt=""
          width={40}
          height={40}
          className={`h-10 w-10 shrink-0 object-cover ${radius}`}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element -- non-WP host (Gravatar/IPFS) — outside the next/image allowlist; see lib/media.ts
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`h-10 w-10 shrink-0 object-cover ${radius}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex h-10 w-10 shrink-0 items-center justify-center bg-cardstock-deep text-sm font-bold text-blueprint ${radius}`}
    >
      {initial}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className="bcc-mono shrink-0 rounded-sm px-2 py-0.5 text-[9px] tracking-[0.18em]"
      style={{
        color: `var(--tier-${tier})`,
        background: "rgb(var(--ink-rgb) / 0.04)",
        border: "1px solid rgb(var(--ink-rgb) / 0.12)",
      }}
    >
      {tier.toUpperCase()}
    </span>
  );
}
