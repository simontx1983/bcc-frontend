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

import { BlogComposer } from "@/components/blog/BlogComposer";
import { UserBlogList } from "@/components/blog/UserBlogList";

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

  return (
    <div className="flex flex-col gap-6">
      <SubTabNav active={active} onSelect={setActive} />

      {active === "view" && <UserBlogList handle={handle} />}

      {active === "create" && (
        <CreateSubTab
          isOwner={isOwner}
          isSignedIn={isSignedIn}
          viewerHandle={viewerHandle}
          onSubmitSuccess={() => setActive("view")}
        />
      )}
    </div>
  );
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
}: {
  isOwner: boolean;
  isSignedIn: boolean;
  viewerHandle: string | null;
  onSubmitSuccess: () => void;
}) {
  if (isOwner) {
    return (
      <div className="bcc-panel flex flex-col gap-3 p-5 md:p-7">
        <BlogComposer onSubmitSuccess={onSubmitSuccess} />
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
