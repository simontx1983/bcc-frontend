"use client";

/**
 * PhotosPanel — PeepSo-shape photos surface for the §3.1 profile.
 *
 * Two sub-tabs mirror PeepSo's `/profile/[handle]/photos/` and
 * `/profile/[handle]/photos/album/`:
 *
 *   ALL PHOTOS — flat grid of every photo post (post_kind === "photo")
 *                from the user's activity stream. Re-uses the existing
 *                /users/:handle/activity endpoint; no new backend
 *                fetch.
 *
 *   ALBUMS     — collection view: each tile is an album cover + title
 *                + photo-count. Click navigates into the album.
 *                Albums are PeepSo's `peepso_user_album` table; the
 *                BCC REST contract doesn't expose them yet, so this
 *                sub-tab ships as a soft "no albums yet" state and
 *                is the next backend follow-up.
 *
 * Owner affordance: "+ ADD PHOTO" routes to the floor composer
 * (V1) on both sub-tabs; future inline album-create button lands
 * with the albums endpoint.
 */

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { useAlbumPhotos, useUserActivity, useUserAlbums } from "@/hooks/useUserActivity";
import type { AlbumPhoto, FeedItem, PhotoBody, UserAlbum } from "@/lib/api/types";
import { clientEnv } from "@/lib/env";

interface PhotosPanelProps {
  handle: string;
  isOwner?: boolean;
}

type PhotoSubTab = "all" | "albums";

export function PhotosPanel({ handle, isOwner = false }: PhotosPanelProps) {
  const [active, setActive] = useState<PhotoSubTab>("all");

  return (
    <article className="bcc-paper">
      <PhotosHeader handle={handle} active={active} isOwner={isOwner} />
      <SubTabStrip active={active} onChange={setActive} />

      <div role="tabpanel" id={`photos-subpanel-${active}`}>
        {active === "all"    && <AllPhotos handle={handle} isOwner={isOwner} />}
        {active === "albums" && <Albums handle={handle} isOwner={isOwner} />}
      </div>
    </article>
  );
}

/**
 * PeepSo serves album CRUD from its own profile route, not from
 * /bcc/v1. The native "Create Album" dialog lives on
 * `/profile/{slug}/photos/album/`, so the BCC "+ NEW ALBUM" CTA links
 * out to that surface — the dialog there handles the multi-step
 * upload + privacy + naming flow PeepSo already maintains. Owner-only.
 *
 * Same-origin link (WP + Next.js share the host) but built off the
 * BCC_API_URL env so dev/stage/prod all resolve correctly.
 */
function peepsoAlbumCreateUrl(handle: string): string {
  const base = clientEnv.BCC_API_URL;
  return `${base}/profile/${encodeURIComponent(handle)}/photos/album/`;
}

// ──────────────────────────────────────────────────────────────────────
// PhotosHeader — shared across both sub-tabs (title + owner CTA).
// ──────────────────────────────────────────────────────────────────────

function PhotosHeader({
  handle,
  active,
  isOwner,
}: {
  handle: string;
  active: PhotoSubTab;
  isOwner: boolean;
}) {
  return (
    <header className="bcc-paper-head">
      <h3
        className="bcc-stencil"
        style={{ fontSize: "16px", letterSpacing: "0.18em" }}
      >
        Photos
      </h3>
      {isOwner && active === "all" && (
        <Link
          href={"/" as Route}
          className="bcc-mono text-safety hover:underline"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          aria-label="Add a photo from the floor composer"
        >
          + ADD PHOTO
        </Link>
      )}
      {isOwner && active === "albums" && (
        // PeepSo's album-create flow needs file upload + activity-stream
        // post side-effects, so V1 routes to its native dialog instead
        // of duplicating that logic in a BCC-native form. Plain <a> (not
        // Link) because the target is WP-rendered, outside the
        // typedRoutes graph.
        <a
          href={peepsoAlbumCreateUrl(handle)}
          className="bcc-mono text-safety hover:underline"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          aria-label="Create a new album"
        >
          + NEW ALBUM
        </a>
      )}
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SubTabStrip — secondary tab nav rendered inside the bcc-paper body.
// Mirrors the ProfilePanel sub-tab pattern: mono caps + safety-orange
// underline active state.
// ──────────────────────────────────────────────────────────────────────

function SubTabStrip({
  active,
  onChange,
}: {
  active: PhotoSubTab;
  onChange: (key: PhotoSubTab) => void;
}) {
  const tabs: Array<{ key: PhotoSubTab; label: string }> = [
    { key: "all",    label: "All Photos" },
    { key: "albums", label: "Albums" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Photo sections"
      className="flex flex-wrap gap-x-6 gap-y-2 border-b border-ink/15 px-5 py-2"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`photos-subtab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`photos-subpanel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={
              "bcc-mono pb-1 transition-colors border-b-2 " +
              (isActive
                ? "text-ink border-safety"
                : "text-ink-soft border-transparent hover:text-ink")
            }
            style={{ fontSize: "11px", letterSpacing: "0.18em" }}
          >
            {tab.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// AllPhotos — flat grid of every photo post from /users/:handle/activity
// filtered for post_kind === "photo".
// ──────────────────────────────────────────────────────────────────────

function AllPhotos({ handle, isOwner }: { handle: string; isOwner: boolean }) {
  const query = useUserActivity(handle);

  if (query.isPending) {
    return (
      <div className="px-8 py-12">
        <p className="bcc-mono text-ink-soft">Loading photos…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-8 py-12">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load photos: {query.error.message}
        </p>
      </div>
    );
  }

  const allItems = query.data.pages.flatMap((page) => page.items);
  const photoItems = allItems.filter(isPhotoItem);

  if (photoItems.length === 0) {
    return <AllPhotosEmpty isOwner={isOwner} />;
  }

  return (
    <div className="px-5 py-5">
      <ul
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {photoItems.map((item) => (
          <PhotoTile key={item.id} item={item} />
        ))}
      </ul>

      {query.hasNextPage && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { void query.fetchNextPage(); }}
            disabled={query.isFetchingNextPage}
            className="bcc-mono border border-ink/30 bg-cardstock px-4 py-2 text-ink disabled:opacity-60"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
          </button>
        </div>
      )}
    </div>
  );
}

function isPhotoItem(
  item: FeedItem,
): item is FeedItem & { body: PhotoBody } {
  if (item.post_kind !== "photo") return false;
  const body = item.body as Partial<PhotoBody> | undefined;
  return typeof body?.photo_url === "string" && body.photo_url !== "";
}

function PhotoTile({
  item,
}: {
  item: FeedItem & { body: PhotoBody };
}) {
  const href = (item.links.self !== "" ? item.links.self : "#") as Route;
  const photoUrl = item.body.photo_url;
  const alt = item.body.alt ?? item.body.caption ?? "Photo";

  return (
    <li>
      <Link
        href={href}
        className="group relative block aspect-square overflow-hidden border border-ink/20 bg-ink/5"
        aria-label={typeof alt === "string" && alt !== "" ? alt : "Open photo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={typeof alt === "string" ? alt : ""}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-105"
        />
        {item.body.caption !== null && item.body.caption !== "" && (
          <span
            aria-hidden
            className="bcc-mono pointer-events-none absolute inset-x-0 bottom-0 line-clamp-1 bg-ink/70 px-2 py-1 text-cardstock opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ fontSize: "10px", letterSpacing: "0.12em" }}
          >
            {item.body.caption}
          </span>
        )}
      </Link>
    </li>
  );
}

function AllPhotosEmpty({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="px-8 py-12">
      <p
        className="bcc-mono mb-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        NOTHING ON FILE
      </p>
      <h4
        className="bcc-stencil text-ink"
        style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
      >
        No photos yet.
      </h4>
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
      >
        Photos posted to the floor land here as a contact sheet —
        thumbnails, click-through to the source post, newest first.
        {isOwner ? " Drop one from the floor composer to start." : ""}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Albums — PeepSo `peepso_photos_album` collection view.
//
// Master-detail in one panel:
//   - GRID view shows all albums for the user (default).
//   - DETAIL view shows photos inside the selected album; "← BACK"
//     returns to the grid.
//
// State lives here so the drill-down doesn't require a new route or
// a remount. Both endpoints carry `Cache-Control: private, max-age=30`
// and React-Query staleTime matches, so flipping in/out of an album
// within the window doesn't refetch.
// ──────────────────────────────────────────────────────────────────────

function Albums({ handle, isOwner }: { handle: string; isOwner: boolean }) {
  const [selected, setSelected] = useState<UserAlbum | null>(null);

  if (selected !== null) {
    return (
      <AlbumDetail
        handle={handle}
        album={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return <AlbumsGrid handle={handle} isOwner={isOwner} onOpen={setSelected} />;
}

function AlbumsGrid({
  handle,
  isOwner,
  onOpen,
}: {
  handle: string;
  isOwner: boolean;
  onOpen: (album: UserAlbum) => void;
}) {
  const query = useUserAlbums(handle);

  if (query.isPending) {
    return (
      <div className="px-8 py-12">
        <p className="bcc-mono text-ink-soft">Loading albums…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-8 py-12">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load albums: {query.error.message}
        </p>
      </div>
    );
  }

  const albums = query.data.items;
  if (albums.length === 0) {
    return <AlbumsEmpty handle={handle} isOwner={isOwner} />;
  }

  return (
    <div className="px-5 py-5">
      <ul
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {albums.map((album) => (
          <AlbumTile key={album.id} album={album} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function AlbumTile({
  album,
  onOpen,
}: {
  album: UserAlbum;
  onOpen: (album: UserAlbum) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(album)}
        className="group relative block aspect-square w-full overflow-hidden border border-ink/20 bg-ink/5 text-left"
        aria-label={`Open album ${album.title}`}
      >
        {album.cover_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.cover_url}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-105"
          />
        ) : (
          <AlbumCoverPlaceholder title={album.title} />
        )}

        {/* Bottom-fixed plate: title + count. Always visible (unlike
            the photo tile's hover-only caption) — the album's name is
            the primary identifier and shouldn't require a hover to
            read. Cardstock plate + ink-black text for readability
            against varied cover imagery. */}
        <span
          aria-hidden
          className="bcc-mono pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-ink/15 bg-cardstock/95 px-2 py-1 text-ink"
          style={{ fontSize: "10px", letterSpacing: "0.12em" }}
        >
          <span className="line-clamp-1">{album.title}</span>
          <span className="shrink-0 opacity-70">{album.photo_count}</span>
        </span>

        {/* Privacy chip on non-public albums so the owner can see at a
            glance which collections aren't fully open. */}
        {album.privacy !== "public" && (
          <span
            aria-hidden
            className="bcc-mono pointer-events-none absolute right-2 top-2 border border-ink/30 bg-cardstock/95 px-1.5 py-0.5 text-ink"
            style={{ fontSize: "9px", letterSpacing: "0.18em" }}
          >
            {album.privacy_label.toUpperCase()}
          </span>
        )}
      </button>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// AlbumDetail — drill-down view for one album's photos.
//
// Receives the full UserAlbum row from the grid so the header + count
// can render immediately (no second meta fetch). Photos load lazily
// via useAlbumPhotos. Each tile links to its source post when one
// exists; falls back to a no-op tile for photos without a parent
// activity post.
// ──────────────────────────────────────────────────────────────────────

function AlbumDetail({
  handle,
  album,
  onBack,
}: {
  handle: string;
  album: UserAlbum;
  onBack: () => void;
}) {
  const query = useAlbumPhotos(handle, album.id);

  return (
    <div className="px-5 py-5">
      <AlbumDetailHeader album={album} onBack={onBack} />

      {query.isPending && (
        <p className="bcc-mono mt-6 text-ink-soft">Loading photos…</p>
      )}

      {query.isError && (
        <p role="alert" className="bcc-mono mt-6 text-safety">
          Couldn&apos;t load photos: {query.error.message}
        </p>
      )}

      {query.isSuccess && query.data.items.length === 0 && (
        <p
          className="bcc-mono mt-6 text-ink-soft"
          style={{ fontSize: "11px", letterSpacing: "0.18em" }}
        >
          THIS ALBUM IS EMPTY.
        </p>
      )}

      {query.isSuccess && query.data.items.length > 0 && (
        <ul
          className="mt-6 grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
        >
          {query.data.items.map((photo) => (
            <AlbumPhotoTile key={photo.id} photo={photo} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AlbumDetailHeader({
  album,
  onBack,
}: {
  album: UserAlbum;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/15 pb-3">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="bcc-mono text-safety hover:underline"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          aria-label="Back to albums"
        >
          ← BACK TO ALBUMS
        </button>
        <h4
          className="bcc-stencil mt-2 text-ink"
          style={{ fontSize: "22px", letterSpacing: "0.02em", lineHeight: 1.1 }}
        >
          {album.title}
        </h4>
        {album.description !== null && album.description !== "" && (
          <p
            className="font-serif text-ink-soft"
            style={{ fontSize: "14px", lineHeight: 1.45, marginTop: "4px" }}
          >
            {album.description}
          </p>
        )}
      </div>
      <div
        className="bcc-mono flex items-center gap-3 text-ink-soft"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        <span>{album.photo_count} PHOTOS</span>
        {album.privacy !== "public" && (
          <span className="border border-ink/30 bg-cardstock/95 px-1.5 py-0.5 text-ink">
            {album.privacy_label.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function AlbumPhotoTile({ photo }: { photo: AlbumPhoto }) {
  const sourceUrl = photo.source_post?.url ?? "";
  const hasUrl    = photo.photo_url !== "";

  const inner = (
    <>
      {hasUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.photo_url}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-cardstock-deep">
          <span
            className="bcc-mono text-ink/50"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            aria-hidden
          >
            UNAVAILABLE
          </span>
        </div>
      )}
    </>
  );

  // Link out to the source activity post when one exists; otherwise
  // render an inert tile so the keyboard tab order doesn't focus a
  // non-interactive element. Plain <a> because activity post URLs are
  // WP-rendered and outside typedRoutes.
  if (sourceUrl !== "") {
    return (
      <li>
        <a
          href={sourceUrl}
          className="group relative block aspect-square overflow-hidden border border-ink/20 bg-ink/5"
          aria-label="Open the post this photo was shared on"
        >
          {inner}
        </a>
      </li>
    );
  }

  return (
    <li>
      <div
        className="group relative block aspect-square overflow-hidden border border-ink/20 bg-ink/5"
        aria-hidden
      >
        {inner}
      </div>
    </li>
  );
}

function AlbumCoverPlaceholder({ title }: { title: string }) {
  // Deterministic-ish empty cover — uses the first letter of the title
  // as a stencil glyph against a cardstock-deep band. Mirrors the
  // CommunityCover fallback rhythm so empty albums don't read as
  // "broken image" — they read as "no cover set yet."
  const glyph = title !== "" ? title.charAt(0).toUpperCase() : "·";
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-cardstock-deep">
      <span
        className="bcc-stencil text-ink/50"
        style={{ fontSize: "48px", letterSpacing: "0.02em" }}
        aria-hidden
      >
        {glyph}
      </span>
    </div>
  );
}

function AlbumsEmpty({ handle, isOwner }: { handle: string; isOwner: boolean }) {
  return (
    <div className="px-8 py-12">
      <p
        className="bcc-mono mb-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        NOTHING ON FILE
      </p>
      <h4
        className="bcc-stencil text-ink"
        style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
      >
        No albums yet.
      </h4>
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
      >
        Albums are PeepSo collections — group related photos into a
        named set with its own cover and privacy.
        {isOwner
          ? " Build the first one and it'll appear here with the cover you pick."
          : ""}
      </p>

      {isOwner && (
        <a
          href={peepsoAlbumCreateUrl(handle)}
          className="bcc-mono mt-6 inline-block border border-ink/30 bg-cardstock px-4 py-2 text-ink hover:bg-ink hover:text-cardstock transition-colors"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          aria-label="Create a new album"
        >
          + NEW ALBUM
        </a>
      )}
    </div>
  );
}
