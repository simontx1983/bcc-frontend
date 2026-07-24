"use client";

/**
 * BlogPanel — Blog tab body inside ProfileTabs on /u/[handle].
 *
 * Sub-tab strip (VIEW · CREATE):
 *   VIEW   — UserBlogList, the existing read-only post list (everyone).
 *   CREATE — BlogComposer for the owner; gated explainer panel for
 *            visitors and anonymous viewers. The strip itself is always
 *            visible (per the 2026-05-14 UX call) so visitors can see
 *            the surface exists, but the mutation seam stays owner-only.
 *
 * This panel is the single mount-point for the long-form composer:
 *   - The previous standalone /blog/new route was retired on
 *     2026-05-14 — replaced by the CREATE sub-tab.
 *   - The previous standalone /u/{handle}/blog route was retired on
 *     2026-05-14 — replaced by this in-tab panel. External links and
 *     the inline Floor composer escalation now target
 *     /u/{handle}?tab=blog (+ &blogsub=create for direct authoring).
 *
 * Deep-link contract (all editing state lives in the URL):
 *   - The outer tab key (`?tab=blog`) is read by ProfileTabs.
 *   - `?blogsub=create` selects the CREATE sub-tab.
 *   - `?edit=<id>` puts CREATE into edit mode for that post. The Edit
 *     button on a list row navigates here, so an in-flight edit is
 *     refresh-safe and shareable. Hydration takes the cache fast-path
 *     (the post is already in the useUserBlog cache when you click Edit
 *     on a row you're looking at) and falls back to `GET /posts/{id}`
 *     for cold loads, deep links, and DRAFTS (which never appear in the
 *     blog feed).
 *
 * On successful submit, we navigate back to VIEW so the author sees
 * their post in the list (BlogComposer's mutation already invalidates
 * the list query).
 */

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";

import {
  BlogComposer,
  type BlogComposerInitialValues,
} from "@/components/blog/BlogComposer";
import { UserBlogList } from "@/components/blog/UserBlogList";
import type { CoverImageValue } from "@/components/blog/CoverImageUpload";
import type { BlogStatus } from "@/components/blog/StatusToggle";
import { USER_BLOG_QUERY_KEY_ROOT } from "@/hooks/useUserBlog";
import { useBlogPost } from "@/hooks/useBlogPost";
import type {
  BccApiError,
  BlogCategory,
  BlogChainTag,
  BlogDisclosure,
  FeedItem,
  FeedResponse,
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Sub-tab + edit target are both derived from the URL — the URL is the
  // single source of truth so editing survives refresh and is shareable.
  const editId = parseEditId(searchParams?.get("edit"));
  const active: SubTabKey =
    searchParams?.get("blogsub") === "create" || editId > 0 ? "create" : "view";

  // Cache fast-path: when the post is already in the useUserBlog cache
  // (the common "Edit a row you're looking at" case), hydrate from it
  // with no network round-trip.
  const cachedInit = useMemo<BlogComposerInitialValues | null>(() => {
    if (editId <= 0) return null;
    const data = queryClient.getQueryData<InfiniteData<FeedResponse>>([
      ...USER_BLOG_QUERY_KEY_ROOT,
      handle,
    ]);
    if (!data) return null;
    for (const page of data.pages) {
      for (const item of page.items) {
        if (readPostId(item) === editId) return bodyToInitialValues(item.body);
      }
    }
    return null;
  }, [queryClient, editId, handle]);

  // Cold path: fetch only on a cache miss (deep link, page refresh, an
  // older post past the first list page, or a draft). Hook is disabled
  // (postId=0) whenever the fast-path already has the post.
  const needsFetch = editId > 0 && cachedInit === null;
  const blogPost = useBlogPost(needsFetch ? editId : 0);
  const fetchedInit =
    needsFetch && blogPost.data ? bodyToInitialValues(blogPost.data) : null;

  const initialValues = cachedInit ?? fetchedInit ?? undefined;

  const handleEdit = (item: FeedItem): void => {
    const postId = readPostId(item);
    // Defensive — the body should always carry wp_post_id post-PR-A, but
    // a malformed payload shouldn't crash the panel. Bail to a blank
    // create form rather than a broken edit URL.
    router.push(
      postId > 0
        ? blogUrl(handle, { editId: postId })
        : blogUrl(handle, { create: true }),
      { scroll: false },
    );
  };

  const handleSubmitSuccess = (): void => {
    // Back to VIEW (clears blogsub + edit). The mutation already
    // invalidated the list query, so the edited row is fresh.
    router.push(blogUrl(handle, {}), { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <SubTabNav
        active={active}
        onSelect={(next) => {
          router.push(blogUrl(handle, { create: next === "create" }), {
            scroll: false,
          });
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
          editId={editId}
          isEditLoading={needsFetch && blogPost.isLoading}
          editError={needsFetch ? blogPost.error : null}
          {...(editId > 0 && initialValues !== undefined
            ? { editingPostId: editId, initialValues }
            : {})}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// URL helper — all blog-panel navigation routes through here so the
// `?tab=blog` outer key is never dropped.
// ──────────────────────────────────────────────────────────────────────

function blogUrl(
  handle: string,
  opts: { create?: boolean; editId?: number },
): Route {
  const editing = opts.editId !== undefined && opts.editId > 0;
  let url = `/u/${encodeURIComponent(handle)}?tab=blog`;
  if (opts.create || editing) url += "&blogsub=create";
  if (editing) url += `&edit=${opts.editId}`;
  return url as Route;
}

function parseEditId(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// ──────────────────────────────────────────────────────────────────────
// Edit-flow plumbing — convert a §3.3.8 body (a FeedItem body from the
// list cache OR the flat GET /posts/{id} edit view-model) into the
// composer's initial-values shape. Defensive narrowing because both
// arrive as untyped JSON on the wire.
// ──────────────────────────────────────────────────────────────────────

function bodyToInitialValues(bodyRaw: unknown): BlogComposerInitialValues {
  const body: Record<string, unknown> =
    typeof bodyRaw === "object" && bodyRaw !== null
      ? (bodyRaw as Record<string, unknown>)
      : {};
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

  // `null` means "no disclosure declared" — preserve it explicitly so
  // the composer's collapsible block opens to the empty state.
  out.disclosure = readDisclosure(body);

  // Sources — hydrate even when empty so the composer's collapsible
  // opens to the empty state. Round-tripping `[]` as the field value
  // is harmless because BlogComposer's submit normalizer always
  // re-sends the array (clear-on-edit semantics).
  const sources = readStringArray(body, "sources");
  if (sources !== null) out.sources = sources;

  const cover = readCover(body);
  if (cover !== null) out.cover_image = cover;

  // Only the GET edit view-model carries `status` — a FeedItem body has
  // none (anything in the blog feed is published). When absent the
  // composer defaults to "publish".
  const status = readBlogStatus(body);
  if (status !== null) out.status = status;

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

function readBlogStatus(body: Record<string, unknown>): BlogStatus | null {
  const value = body["status"];
  return value === "draft" || value === "publish" ? value : null;
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
  // `width` + `height` aren't shipped in the body (the cover preview
  // uses `<Image fill>` which ignores them). Zeros satisfy the
  // CoverImageValue contract without round-tripping the actual pixel
  // dims through the wire.
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
      className="flex items-center gap-x-1 border-b border-bcc-border"
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
              ? "border-safety text-bcc-text"
              : "border-transparent text-bcc-text-secondary hover:text-bcc-text")
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
// CreateSubTab — owner branch shows the composer (with cold-load
// hydration loading/error states for `?edit=<id>`); non-owners get the
// gated explainer panels.
// ──────────────────────────────────────────────────────────────────────

function CreateSubTab({
  isOwner,
  isSignedIn,
  viewerHandle,
  onSubmitSuccess,
  editId,
  isEditLoading,
  editError,
  editingPostId,
  initialValues,
}: {
  isOwner: boolean;
  isSignedIn: boolean;
  viewerHandle: string | null;
  onSubmitSuccess: () => void;
  /** Post id from `?edit=<id>` (0 = blank create). Drives hydration UX. */
  editId: number;
  /** Cold-load hydration is in flight (cache miss). */
  isEditLoading: boolean;
  /** Cold-load hydration failed (forbidden / not-found / network). */
  editError: BccApiError | null;
  /** When set, composer mounts in edit mode and PATCHes on submit. */
  editingPostId?: number;
  initialValues?: BlogComposerInitialValues;
}) {
  if (isOwner) {
    if (editId > 0 && editError !== null) {
      return (
        <div className="bcc-panel flex flex-col gap-3 p-6">
          <p
            className="bcc-mono text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            CAN&rsquo;T OPEN POST
          </p>
          <p className="font-serif text-base text-bcc-text">
            {editPostErrorCopy(editError)}
          </p>
        </div>
      );
    }

    if (editId > 0 && initialValues === undefined && isEditLoading) {
      return (
        <div className="bcc-panel flex flex-col gap-3 p-6">
          <p
            className="bcc-mono text-bcc-text-secondary"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            LOADING POST…
          </p>
        </div>
      );
    }

    return (
      <div className="bcc-panel flex flex-col gap-3 p-5 md:p-7">
        {/* Key on the edit target so navigating between posts (or from a
            blank draft to an edit) remounts the composer with fresh
            initial values rather than reusing stale form state. */}
        <BlogComposer
          key={editingPostId ?? "new"}
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
        <p className="font-serif text-base text-bcc-text">
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
      <p className="font-serif text-base text-bcc-text">
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

// Presentation copy owned at the call site (§A2) — branch on err.code,
// never err.message.
function editPostErrorCopy(err: BccApiError): string {
  switch (err.code) {
    case "bcc_forbidden":
      return "That post belongs to another operator — you can only edit your own.";
    case "bcc_not_found":
      return "That post no longer exists — it may have been deleted.";
    default:
      return "Couldn't load that post. Try again in a moment.";
  }
}
