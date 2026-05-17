"use client";

/**
 * BlogPanel — Blog tab body inside ProfileTabs on /u/[handle].
 *
 * Sub-tab strip (VIEW · CREATE):
 *   VIEW   — UserBlogList, the existing read-only post list (everyone).
 *   CREATE — BlogForm for the owner; gated explainer panel for visitors
 *            and anonymous viewers. The strip itself is always visible
 *            (per the 2026-05-14 UX call) so visitors can see the
 *            surface exists, but the mutation seam stays owner-only.
 *
 * This panel is the single mount-point for the long-form composer:
 *   - The previous standalone /blog/new route was retired on
 *     2026-05-14 — replaced by the CREATE sub-tab.
 *   - The previous standalone /u/{handle}/blog route was retired on
 *     2026-05-14 — replaced by this in-tab panel. External links and
 *     the inline Floor composer escalation now target
 *     /u/{handle}?tab=blog (+ &blogsub=create for direct authoring).
 *
 * Deep-link contract:
 *   - The outer tab key (`?tab=blog`) is read by ProfileTabs.
 *   - The inner sub-tab key (`?blogsub=create`) is read here on mount.
 *
 * On successful submit, the sub-tab flips back to VIEW so the author
 * sees their post in the list (BlogForm's mutation already invalidates
 * the list query).
 */

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";

import {
  BlogComposer,
  type BlogComposerInitialValues,
} from "@/components/blog/BlogComposer";
import { UserBlogList } from "@/components/blog/UserBlogList";
import type { CoverImageValue } from "@/components/blog/CoverImageUpload";
import type {
  BlogCategory,
  BlogChainTag,
  BlogDisclosure,
  FeedItem,
} from "@/lib/api/types";

type SubTabKey = "view" | "create";

interface SubTabDef {
  key: SubTabKey;
  label: string;
}

const SUB_TABS: ReadonlyArray<SubTabDef> = [
  { key: "view",   label: "View" },
  { key: "create", label: "Create" },
];

export interface BlogPanelProps {
  /** Handle of the profile being viewed (page owner). */
  handle: string;
  /** Viewer is the page owner — gate for the CREATE composer. */
  isOwner: boolean;
  /** Viewer is signed in (even if not the owner) — drives CREATE empty-state copy. */
  isSignedIn: boolean;
  /** Signed-in viewer's own handle, for the "write on your own blog" link. */
  viewerHandle: string | null;
}

export function BlogPanel({
  handle,
  isOwner,
  isSignedIn,
  viewerHandle,
}: BlogPanelProps) {
  // Deep-link support — the inline Composer's "Long-form →" escalation
  // link routes to `/u/{handle}?tab=blog&blogsub=create` so an author
  // can land directly on the composer surface without extra clicks.
  // The outer `?tab=blog` is read by ProfileTabs; we read `?blogsub`
  // here to disambiguate from the outer key.
  const searchParams = useSearchParams();
  const initialTab: SubTabKey =
    searchParams?.get("blogsub") === "create" ? "create" : "view";
  const [active, setActive] = useState<SubTabKey>(initialTab);

  // Edit-flow state. When the owner clicks "Edit" on a post in VIEW,
  // we lift the post's body up here and pass it to the composer as
  // initialValues + editingPostId. On a successful submit (PATCH) or
  // an explicit cancel, this clears and the composer falls back to
  // its "blank canvas" create mode.
  const [editing, setEditing] = useState<{
    postId: number;
    initialValues: BlogComposerInitialValues;
  } | null>(null);

  const handleEdit = (item: FeedItem): void => {
    const initial = feedItemToInitialValues(item);
    const postId = readPostId(item);
    if (postId <= 0) {
      // Defensive — the body should always carry wp_post_id post-PR-A,
      // but a malformed payload shouldn't crash the panel. Bail to
      // create-mode and let the writer start over.
      setEditing(null);
      setActive("create");
      return;
    }
    setEditing({ postId, initialValues: initial });
    setActive("create");
  };

  const handleSubmitSuccess = (): void => {
    setEditing(null);
    setActive("view");
  };

  return (
    <div className="flex flex-col gap-6">
      <SubTabNav
        active={active}
        onSelect={(next) => {
          // Switching to view abandons any in-flight edit — author
          // can re-click Edit on the post to resume.
          if (next === "view") setEditing(null);
          setActive(next);
        }}
      />

      {active === "view" && (
        <UserBlogList
          handle={handle}
          {...(isOwner ? { onEdit: handleEdit } : {})}
        />
      )}

      {active === "create" && (
        <CreateSubTab
          isOwner={isOwner}
          isSignedIn={isSignedIn}
          viewerHandle={viewerHandle}
          onSubmitSuccess={handleSubmitSuccess}
          {...(editing !== null
            ? {
                editingPostId: editing.postId,
                initialValues:  editing.initialValues,
              }
            : {})}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Edit-flow plumbing — convert a §3.3.8 FeedItem body into the
// composer's initial-values shape. Defensive narrowing because
// `FeedItem.body` is `Record<string, unknown>` on the wire.
// ──────────────────────────────────────────────────────────────────────

function feedItemToInitialValues(item: FeedItem): BlogComposerInitialValues {
  const body = item.body;
  const out: BlogComposerInitialValues = {};

  const title = readString(body, "title");
  if (title !== null) out.title = title;

  const excerpt = readString(body, "excerpt");
  if (excerpt !== null) out.excerpt = excerpt;

  const content = readString(body, "full_text");
  if (content !== null) out.content = content;

  const category = readBlogCategory(body);
  if (category !== null) out.category = category;

  const tags = readStringArray(body, "tags");
  if (tags !== null) out.tags = tags;

  const chainSlugs = readChainSlugs(body);
  if (chainSlugs !== null) out.chain_tags = chainSlugs;

  const disclosure = readDisclosure(body);
  // `null` means "no disclosure declared" — preserve it explicitly so
  // the composer's collapsible block opens to the empty state.
  out.disclosure = disclosure;

  // Sources — hydrate even when empty so the composer's collapsible
  // opens to the empty state. Round-tripping `[]` as the field value
  // is harmless because BlogComposer's submit normalizer always
  // re-sends the array (clear-on-edit semantics).
  const sources = readStringArray(body, "sources");
  if (sources !== null) out.sources = sources;

  const cover = readCover(body);
  if (cover !== null) out.cover_image = cover;

  return out;
}

function readPostId(item: FeedItem): number {
  const raw = item.body["wp_post_id"];
  return typeof raw === "number" && raw > 0 ? raw : 0;
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

function readBlogCategory(body: Record<string, unknown>): BlogCategory | null {
  const value = body["category"];
  if (
    value === "news" ||
    value === "analysis" ||
    value === "guide" ||
    value === "opinion" ||
    value === "tools" ||
    value === "events"
  ) {
    return value;
  }
  return null;
}

function readStringArray(body: Record<string, unknown>, key: string): string[] | null {
  const raw = body[key];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t === "string" && t !== "") out.push(t);
  }
  return out;
}

function readChainSlugs(body: Record<string, unknown>): string[] | null {
  const raw = body["chain_tags"];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const c of raw) {
    if (typeof c !== "object" || c === null) continue;
    const slug = (c as Partial<BlogChainTag>).slug;
    if (typeof slug === "string" && slug !== "") out.push(slug);
  }
  return out;
}

function readDisclosure(body: Record<string, unknown>): BlogDisclosure | null {
  const raw = body["disclosure"];
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const tickersRaw = obj["tickers"];
  const tickers = Array.isArray(tickersRaw)
    ? tickersRaw.filter((t): t is string => typeof t === "string" && t !== "")
    : [];
  const note = typeof obj["note"] === "string" ? obj["note"] : "";
  return { tickers, note };
}

function readCover(body: Record<string, unknown>): CoverImageValue | null {
  const id  = body["cover_image_id"];
  const url = body["cover_image_url"];
  if (typeof id !== "number" || id <= 0) return null;
  if (typeof url !== "string" || url === "") return null;
  // `width` + `height` aren't shipped in the FeedItem body (the cover
  // preview uses `<Image fill>` which ignores them). Zeros satisfy
  // the CoverImageValue contract without round-tripping the actual
  // pixel dims through the wire.
  return { attachment_id: id, url, width: 0, height: 0 };
}

// ──────────────────────────────────────────────────────────────────────
// SubTabNav — mirrors the Setup tab's cardstock-on-dark sub-strip so
// the two operator-facing surfaces share visual vocabulary.
// ──────────────────────────────────────────────────────────────────────

function SubTabNav({
  active,
  onSelect,
}: {
  active: SubTabKey;
  onSelect: (key: SubTabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Blog sections"
      className="flex items-center gap-x-1 border-b border-cardstock/15"
    >
      {SUB_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onSelect(tab.key)}
          className={
            "bcc-mono shrink-0 border-b-2 px-4 py-2 transition " +
            (active === tab.key
              ? "border-safety text-cardstock"
              : "border-transparent text-cardstock-deep hover:text-cardstock")
          }
          style={{ fontSize: "12px", letterSpacing: "0.18em" }}
        >
          {tab.label.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CreateSubTab — three branches:
//   1. Owner → BlogForm with onSubmitSuccess flipping back to VIEW.
//   2. Signed-in visitor → "your composer lives on your own blog page."
//   3. Anonymous → "sign in to write."
// ──────────────────────────────────────────────────────────────────────

function CreateSubTab({
  isOwner,
  isSignedIn,
  viewerHandle,
  onSubmitSuccess,
  editingPostId,
  initialValues,
}: {
  isOwner: boolean;
  isSignedIn: boolean;
  viewerHandle: string | null;
  onSubmitSuccess: () => void;
  /** When set, composer mounts in edit mode and PATCHes on submit. */
  editingPostId?: number;
  initialValues?: BlogComposerInitialValues;
}) {
  if (isOwner) {
    return (
      <div className="bcc-panel flex flex-col gap-3 p-5 md:p-7">
        <BlogComposer
          onSubmitSuccess={onSubmitSuccess}
          {...(editingPostId !== undefined ? { editingPostId } : {})}
          {...(initialValues !== undefined ? { initialValues } : {})}
        />
      </div>
    );
  }

  if (isSignedIn && viewerHandle !== null) {
    const yourBlog = `/u/${viewerHandle}?tab=blog` as Route;
    return (
      <div className="bcc-panel flex flex-col gap-3 p-6">
        <p
          className="bcc-mono text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          NOT YOUR FILE
        </p>
        <p className="font-serif text-base text-ink">
          You can&rsquo;t post to another operator&rsquo;s blog. Your
          composer lives on your own blog page.
        </p>
        <Link
          href={yourBlog}
          className="bcc-mono text-safety hover:underline underline-offset-4 self-start"
        >
          Open your blog →
        </Link>
      </div>
    );
  }

  return (
    <div className="bcc-panel flex flex-col gap-3 p-6">
      <p
        className="bcc-mono text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        SIGN IN
      </p>
      <p className="font-serif text-base text-ink">
        Sign in to write long-form posts on your own blog page.
      </p>
      <Link
        href={"/login" as Route}
        className="bcc-mono text-safety hover:underline underline-offset-4 self-start"
      >
        Sign in →
      </Link>
    </div>
  );
}
