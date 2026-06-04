"use client";

/**
 * useBlogPost — fetch a single blog post for the §D6 composer's
 * `?edit=<id>` cold-load / deep-link path (`GET /posts/{id}`).
 *
 * Owner-only edit-read; the server returns the author's own DRAFTS too
 * (drafts have no activity row, so they never appear in `useUserBlog`).
 *
 * Callers gate the fetch with the cache fast-path: when the post is
 * already in the `useUserBlog` cache (the common "Edit a post you're
 * looking at" case), they map it locally and pass `0` here so this hook
 * stays disabled — only genuine cold loads hit the network.
 */

import { useQuery } from "@tanstack/react-query";

import { getBlogPost } from "@/lib/api/blog-endpoints";
import type { BccApiError, BlogEditViewModel } from "@/lib/api/types";

export const BLOG_POST_QUERY_KEY_ROOT = ["blog-post"] as const;

export function useBlogPost(postId: number) {
  return useQuery<BlogEditViewModel, BccApiError>({
    queryKey: [...BLOG_POST_QUERY_KEY_ROOT, postId],
    queryFn: ({ signal }) => getBlogPost(postId, signal),
    enabled: postId > 0,
    // The composer hydrates once on mount; a short stale window is fine.
    // An edit that lands invalidates useUserBlog (the list), not this.
    staleTime: 30_000,
  });
}
