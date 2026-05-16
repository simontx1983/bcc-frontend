"use client";

/**
 * BlogComposer — V1 crypto-native blog composer.
 *
 * Orchestrates: TitleInput · CategoryPicker · CoverImageUpload ·
 * BodyEditor · ChainTagsPicker · TagsInput · DisclosureBlock ·
 * StatusToggle.
 *
 * Submit:
 *   - new post → POST /bcc/v1/posts {kind: "blog", …}
 *   - existing post (editingPostId set) → PATCH /bcc/v1/posts/{id}
 *     (V1 ship: editing path is wired but initialValues hydration
 *      from the server is a V1.5 polish — composer accepts
 *      `initialValues` prop from the caller for now.
 *      TODO(V1.5): wire `?edit=<id>` initialValues fetch.)
 *
 * Auto-save: BodyEditor writes the body string to
 * `bcc.blog.draft.{userId}` every 5s. On mount, BlogComposer
 * restores the localStorage draft if one exists AND no
 * initialValues were supplied (a draft restore should never clobber
 * an explicit edit hydration). On successful submit, the
 * localStorage key is cleared.
 *
 * Disclosure normalization: empty `{tickers: [], note: ''}` is sent
 * as `null` (server rejects empty struct as bcc_invalid_request).
 *
 * §A2 server-pinned copy: errors come back via the API envelope;
 * the composer humanizes via lib/api/errors.humanizeCode against a
 * code→copy map declared in this file (presentation copy owned at
 * call site, never derived from err.message).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  BLOG_EXCERPT_MAX_LENGTH,
  BLOG_EXCERPT_MIN_LENGTH,
  type BlogCategory,
  type BlogDisclosure,
} from "@/lib/api/types";
import { createBlog, updateBlog } from "@/lib/api/posts-endpoints";
import { humanizeCode } from "@/lib/api/errors";

import { BodyEditor } from "./BodyEditor";
import { CategoryPicker } from "./CategoryPicker";
import { ChainTagsPicker } from "./ChainTagsPicker";
import { CoverImageUpload, type CoverImageValue } from "./CoverImageUpload";
import { DisclosureBlock } from "./DisclosureBlock";
import { StatusToggle, type BlogStatus } from "./StatusToggle";
import { TagsInput } from "./TagsInput";
import { TitleInput } from "./TitleInput";

export interface BlogComposerInitialValues {
  title?: string;
  excerpt?: string;
  content?: string;
  category?: BlogCategory;
  tags?: string[];
  chain_tags?: string[];
  disclosure?: BlogDisclosure | null;
  cover_image?: CoverImageValue | null;
  status?: BlogStatus;
}

export interface BlogComposerProps {
  onSubmitSuccess?: () => void;
  /** When set, submit calls PATCH /posts/{id} instead of POST /posts. */
  editingPostId?: number;
  initialValues?: BlogComposerInitialValues;
}

const COMPOSER_COPY: Record<string, string> = {
  bcc_unauthorized:   "Sign in to publish.",
  bcc_forbidden:      "You don't have permission to edit this post.",
  bcc_not_found:      "Post not found — it may have been deleted.",
  bcc_invalid_request: "One of the fields didn't validate. Check title, category, and disclosure.",
  bcc_rate_limited:   "Slow down — too many submissions in a short window.",
  bcc_unavailable:    "Publishing is temporarily unavailable.",
};

export function BlogComposer({
  onSubmitSuccess,
  editingPostId,
  initialValues,
}: BlogComposerProps) {
  const router = useRouter();
  const session = useSession();
  const userId = session.data?.user.handle ?? "anon";
  const autosaveKey = `bcc.blog.draft.${userId}`;

  const [title,     setTitle]     = useState(initialValues?.title ?? "");
  const [excerpt,   setExcerpt]   = useState(initialValues?.excerpt ?? "");
  const [body,      setBody]      = useState(initialValues?.content ?? "");
  const [category,  setCategory]  = useState<BlogCategory | null>(initialValues?.category ?? null);
  const [tags,      setTags]      = useState<string[]>(initialValues?.tags ?? []);
  const [chainTags, setChainTags] = useState<string[]>(initialValues?.chain_tags ?? []);
  const [disclosure, setDisclosure] = useState<BlogDisclosure | null>(initialValues?.disclosure ?? null);
  const [cover,     setCover]     = useState<CoverImageValue | null>(initialValues?.cover_image ?? null);
  const [status,    setStatus]    = useState<BlogStatus>(initialValues?.status ?? "publish");

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Restore auto-saved draft on mount when no initialValues supplied.
  useEffect(() => {
    if (initialValues !== undefined) return;
    try {
      const saved = window.localStorage.getItem(autosaveKey);
      if (saved !== null && saved !== "") {
        setBody(saved);
      }
    } catch {
      // localStorage unavailable — silent.
    }
    // Intentionally one-shot: do NOT re-run when autosaveKey identity
    // changes mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const excerptTrimmed = excerpt.trim();
  const excerptUnderMin = excerptTrimmed.length > 0 && excerptTrimmed.length < BLOG_EXCERPT_MIN_LENGTH;
  const excerptOverMax  = excerpt.length > BLOG_EXCERPT_MAX_LENGTH;

  const canSubmit =
    !submitting &&
    title.trim() !== "" &&
    body.trim() !== "" &&
    excerptTrimmed.length >= BLOG_EXCERPT_MIN_LENGTH &&
    excerptTrimmed.length <= BLOG_EXCERPT_MAX_LENGTH &&
    category !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || category === null) return;
    setSubmitting(true);
    setError(null);

    // Disclosure normalization: empty struct → null. The server
    // rejects `{tickers: [], note: ''}` as bcc_invalid_request.
    const normalizedDisclosure =
      disclosure !== null && (disclosure.tickers.length > 0 || disclosure.note.trim() !== "")
        ? disclosure
        : null;

    try {
      if (editingPostId !== undefined) {
        await updateBlog(editingPostId, {
          title:           title.trim(),
          excerpt:         excerptTrimmed,
          content:         body.trim(),
          category,
          tags,
          chain_tags:      chainTags,
          disclosure:      normalizedDisclosure,
          cover_image_id:  cover?.attachment_id ?? 0,
          status,
        });
      } else {
        await createBlog({
          title:           title.trim(),
          excerpt:         excerptTrimmed,
          content:         body.trim(),
          category,
          tags,
          chain_tags:      chainTags,
          ...(normalizedDisclosure !== null ? { disclosure: normalizedDisclosure } : {}),
          ...(cover !== null ? { cover_image_id: cover.attachment_id } : {}),
          status,
        });
      }

      // Clear the auto-saved draft on success.
      try {
        window.localStorage.removeItem(autosaveKey);
      } catch {
        /* silent */
      }

      onSubmitSuccess?.();
      router.refresh();
    } catch (err) {
      setError(humanizeCode(err, COMPOSER_COPY, "Couldn't publish — try again in a moment."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-label="Compose a blog post">
      <CategoryPicker value={category} onChange={setCategory} disabled={submitting} />
      <TitleInput value={title} onChange={setTitle} disabled={submitting} />
      <CoverImageUpload value={cover} onChange={setCover} disabled={submitting} />

      <label className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
          EXCERPT <span className="text-safety">*</span> · Floor teaser ({BLOG_EXCERPT_MIN_LENGTH}–{BLOG_EXCERPT_MAX_LENGTH} chars)
        </span>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="One sentence that pulls people into the full post."
          rows={2}
          maxLength={BLOG_EXCERPT_MAX_LENGTH + 100}
          disabled={submitting}
          className="bcc-mono w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/40 px-3 py-2 text-[12px] text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
        />
        <span
          className={
            "bcc-mono self-end text-[10px] " +
            (excerptOverMax || excerptUnderMin
              ? "text-safety"
              : excerpt.length > BLOG_EXCERPT_MAX_LENGTH - 50
                ? "text-warning"
                : "text-ink-soft")
          }
        >
          {excerpt.length} / {BLOG_EXCERPT_MAX_LENGTH}
          {excerptUnderMin && (
            <span className="ml-2">(need ≥ {BLOG_EXCERPT_MIN_LENGTH})</span>
          )}
        </span>
      </label>

      <BodyEditor
        value={body}
        onChange={setBody}
        autosaveKey={autosaveKey}
        disabled={submitting}
      />

      <ChainTagsPicker value={chainTags} onChange={setChainTags} disabled={submitting} />
      <TagsInput value={tags} onChange={setTags} disabled={submitting} />
      <DisclosureBlock value={disclosure} onChange={setDisclosure} disabled={submitting} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-cardstock-edge/30 pt-4">
        <StatusToggle value={status} onChange={setStatus} disabled={submitting} />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          className={
            "bcc-stencil rounded-sm px-5 py-2 text-[12px] tracking-[0.2em] transition " +
            (canSubmit
              ? "bg-ink text-cardstock hover:bg-blueprint"
              : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
          }
        >
          {submitting
            ? "PUBLISHING…"
            : status === "draft"
              ? "SAVE DRAFT"
              : editingPostId !== undefined
                ? "UPDATE BLOG POST"
                : "PUBLISH BLOG POST"}
        </button>
      </div>

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
        </p>
      )}
    </form>
  );
}
