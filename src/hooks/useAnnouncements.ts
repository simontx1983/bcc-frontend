"use client";

/**
 * Announcement query + mutation hooks (api-contract-v1.md §4.32).
 *
 * ⚠ The backend does not exist yet (bcc-trust A2/A3/A5). These hooks are
 * real — they call the typed client, not a stub — so every one of them
 * currently resolves to a 404. That is deliberate: a hook that invented
 * data would make the missing backend invisible, and the surfaces would
 * look finished when they are not.
 *
 * Every hook is `enabled`-gated by its caller on the server-supplied
 * capability block, so in production nothing mounts and nothing fetches.
 *
 * Shape follows the house rule: return the React Query object as-is
 * (`{ data, isLoading, error, … }`). No parallel loading state, no
 * server state mirrored into `useState`.
 */

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";

import {
  archiveAnnouncement,
  createAnnouncement,
  createAnnouncementComment,
  getAnnouncementAsClient,
  getAnnouncementRotator,
  listAnnouncementComments,
  listAnnouncements,
  removeAnnouncementComment,
  setAnnouncementPin,
  updateAnnouncement,
} from "@/lib/api/announcement-endpoints";
// BccApiError is referenced only in generic positions here, so it comes
// in as a type — the runtime class is never constructed in this module.
import { useViewerScope } from "@/hooks/useViewerScope";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import type { BccApiError } from "@/lib/api/types";
import type {
  AnnouncementCommentsResponse,
  AnnouncementDetail,
  AnnouncementListResponse,
  AnnouncementListState,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
} from "@/lib/api/types";

const PAGE_SIZE = 20;
const COMMENT_PAGE_SIZE = 20;

/**
 * ## Which announcement caches are viewer-scoped, and which are not
 *
 * The gate/cancel/clear chain in `lib/auth/session-boundary` is still the
 * primary protection and is unchanged: `PrivateRenderGate` unmounts the
 * private subtree first, and only then does the bridge `cancelQueries()`
 * and `clear()`. Scoped keys **supplement** that; they do not replace it.
 * What they add is a second, structural guarantee that does not depend on
 * teardown ordering — two viewers simply never address the same entry.
 *
 * VIEWER-DEPENDENT, therefore scoped:
 *
 *   - the **list**, because `Announcement.capabilities` is optional and
 *     "attached for a viewer who may manage, absent for public readers";
 *   - the **detail**, because it carries `status` — and `draft`,
 *     `scheduled` and `blocked` are owner-visible only — plus a required
 *     capability block; and
 *   - the **comments page**, because `can_comment` is resolved per viewer
 *     from authentication, standing, fraud state and the rest.
 *
 * VIEWER-INDEPENDENT, therefore deliberately left public:
 *
 *   - the **rotator**. §4.32.11 supplies capabilities "only by
 *     announcement-scoped responses: the detail view-model, the comments
 *     page, and rows in an owner-scoped list" — the rotator is none of
 *     those — and §4.32.1 means every row it can return is already
 *     published, due and public. It is byte-identical for every viewer,
 *     so scoping it would only fragment a cache that is safe to share and
 *     would delay the public billboard behind session resolution.
 *
 * ⚠ If the server ever attaches a capability block to rotator rows, that
 * decision moves the rotator into the scoped set. The reason it is public
 * is a contract property, not a convenience.
 *
 * ## The scope value
 *
 * `useViewerScope()` — the viewer's id, `ANON_SCOPE` for a resolved
 * signed-out visitor, or `null` when identity is UNAVAILABLE. A `null`
 * scope never reads or writes: it must not fall back to the anonymous
 * namespace (the measured cross-account display defect the released stack
 * exists to close) and it must not issue an owner-bearing query.
 */

/**
 * Prefix key for everything under one validator page, across ALL scopes.
 *
 * Invalidation target, never a read key. Being scope-blind is the point:
 * a mutation should mark every viewer's view of this page stale, not only
 * the acting viewer's.
 */
export function announcementsQueryKey(pageId: number): QueryKey {
  return ["announcements", pageId];
}

/**
 * Exact list key. `state` is a cache dimension so Active and Archived
 * never collide, and `scope` is one so two viewers never collide.
 */
export function announcementsListQueryKey(
  pageId: number,
  state: AnnouncementListState,
  scope: ViewerScope,
): QueryKey {
  return ["announcements", pageId, "list", state, scope];
}

/** Scope-blind prefix for one announcement — invalidation only. */
export function announcementDetailKeyRoot(announcementId: string): QueryKey {
  return ["announcement", announcementId];
}

export function announcementDetailQueryKey(
  announcementId: string,
  scope: ViewerScope,
): QueryKey {
  return ["announcement", announcementId, scope];
}

/** Scope-blind prefix for one discussion — invalidation only. */
export function announcementCommentsKeyRoot(announcementId: string): QueryKey {
  return ["announcement-comments", announcementId];
}

export function announcementCommentsQueryKey(
  announcementId: string,
  scope: ViewerScope,
): QueryKey {
  return ["announcement-comments", announcementId, scope];
}

/** Public — see the note above on why the rotator is NOT scoped. */
export function announcementRotatorQueryKey(pageId: number): QueryKey {
  return ["announcements", pageId, "rotator"];
}

/**
 * The bounded set behind the announcement bar.
 *
 * `enabled` MUST be driven by the presence of the server capability
 * block. With it false nothing is requested at all — which is what keeps
 * a backend that has never heard of announcements from being asked.
 *
 * A failure here must never take the validator profile down with it:
 * the bar is supplementary, so the caller renders a compact failure and
 * the rest of the page carries on. Retry is left to the viewer rather
 * than a background loop, so a missing backend does not turn into a
 * stream of 404s behind every profile view.
 */
export function useAnnouncementRotator(
  pageId: number,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  return useQuery<AnnouncementListResponse, BccApiError>({
    queryKey: announcementRotatorQueryKey(pageId),
    enabled: enabled && pageId > 0,
    queryFn: () => getAnnouncementRotator(pageId),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Paginated announcements for one validator, per lifecycle state.
 *
 * `enabled` MUST be driven by the server capability block. Passing
 * `enabled: false` when the block is absent is what keeps the feature
 * invisible — and silent — on a backend that has never heard of it.
 */
export function useAnnouncements(
  pageId: number,
  options: { state?: AnnouncementListState; enabled?: boolean } = {},
) {
  const state = options.state ?? "active";
  const enabled = options.enabled ?? true;
  // Viewer-dependent: list rows may carry a capability block.
  const scope = useViewerScope();

  return useInfiniteQuery<
    AnnouncementListResponse,
    BccApiError,
    InfiniteData<AnnouncementListResponse>,
    QueryKey,
    string | null
  >({
    queryKey: announcementsListQueryKey(pageId, state, scope),
    // `scope === null` is identity UNAVAILABLE. Nothing is requested and
    // nothing is read: falling back to the anonymous namespace is the
    // defect the released stack closed, and issuing a capability-bearing
    // read before we know whose it is is the one this closes.
    enabled: enabled && pageId > 0 && scope !== null,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      listAnnouncements({
        pageId,
        state,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.pagination.next_cursor ?? undefined,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** One announcement's detail view-model, including the viewer's capability block. */
export function useAnnouncement(
  announcementId: string,
  pageId: number,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  // Viewer-dependent: `status` exposes owner-only states (draft,
  // scheduled, blocked) and the capability block is required here.
  const scope = useViewerScope();
  return useQuery<AnnouncementDetail, BccApiError>({
    queryKey: announcementDetailQueryKey(announcementId, scope),
    enabled:
      enabled && announcementId !== "" && pageId > 0 && scope !== null,
    queryFn: () => getAnnouncementAsClient(pageId, announcementId),
    staleTime: 30_000,
  });
}

/**
 * The canonical chronological discussion — flat, oldest-first.
 *
 * Oldest-first matters for the cache: new comments append to the END of
 * the LAST page, not the head of the first. Getting that backwards would
 * put a just-posted comment above months of history.
 */
export function useAnnouncementComments(
  announcementId: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  // Viewer-dependent: `can_comment` travels on this response and is
  // resolved per viewer from auth, standing, fraud state and the rest.
  const scope = useViewerScope();
  return useInfiniteQuery<
    AnnouncementCommentsResponse,
    BccApiError,
    InfiniteData<AnnouncementCommentsResponse>,
    QueryKey,
    string | null
  >({
    queryKey: announcementCommentsQueryKey(announcementId, scope),
    enabled: enabled && announcementId !== "" && scope !== null,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      listAnnouncementComments({
        announcementId,
        cursor: pageParam ?? undefined,
        limit: COMMENT_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.pagination.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/**
 * Create an announcement.
 *
 * No optimistic insert. The server decides the resulting state — a
 * `schedule` can be rejected for not being far enough in the future, and
 * a `publish` only becomes public once it carries a valid
 * publication-authorization marker. Showing a row before the server has
 * ruled would be showing a state that may never exist.
 */
export function useCreateAnnouncement(pageId: number) {
  const queryClient = useQueryClient();
  return useMutation<AnnouncementDetail, BccApiError, CreateAnnouncementRequest>({
    mutationFn: (request) => createAnnouncement(pageId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementsQueryKey(pageId) });
    },
  });
}

export function useUpdateAnnouncement(pageId: number, announcementId: string) {
  const queryClient = useQueryClient();
  const scope = useViewerScope();
  return useMutation<AnnouncementDetail, BccApiError, UpdateAnnouncementRequest>({
    mutationFn: (request) => updateAnnouncement(pageId, announcementId, request),
    onSuccess: (detail) => {
      // Write only into a KNOWN scope. With identity unavailable we
      // cannot say whose view this payload is, so we invalidate rather
      // than file it under a guess.
      if (scope !== null) {
        queryClient.setQueryData(
          announcementDetailQueryKey(announcementId, scope),
          detail,
        );
      }
      // Scope-BLIND roots: every viewer's cached view of this row and
      // this page is now stale, not only the acting viewer's.
      void queryClient.invalidateQueries({
        queryKey: announcementDetailKeyRoot(announcementId),
      });
      void queryClient.invalidateQueries({ queryKey: announcementsQueryKey(pageId) });
    },
  });
}

/**
 * Archive — one-way in v1.
 *
 * Invalidates both list states, because the row moves from Active to
 * Archived in the same action.
 */
export function useArchiveAnnouncement(pageId: number, announcementId: string) {
  const queryClient = useQueryClient();
  const scope = useViewerScope();
  return useMutation<AnnouncementDetail, BccApiError, void>({
    mutationFn: () => archiveAnnouncement(pageId, announcementId),
    onSuccess: (detail) => {
      if (scope !== null) {
        queryClient.setQueryData(
          announcementDetailQueryKey(announcementId, scope),
          detail,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: announcementDetailKeyRoot(announcementId),
      });
      // Archiving also closes the discussion to new comments, so every
      // viewer's `can_comment` is stale — and that gate travels on the
      // comments response, not on the announcement.
      void queryClient.invalidateQueries({
        queryKey: announcementCommentsKeyRoot(announcementId),
      });
      void queryClient.invalidateQueries({ queryKey: announcementsQueryKey(pageId) });
    },
  });
}

/**
 * Pin / unpin.
 *
 * Deliberately NOT optimistic. Pinning is exclusive — the server unpins
 * whatever was pinned before, and the client does not know which row
 * that was without refetching. An optimistic flip would show two pinned
 * announcements until the refetch landed.
 */
export function useSetAnnouncementPin(pageId: number) {
  const queryClient = useQueryClient();
  return useMutation<unknown, BccApiError, { announcementId: string; pinned: boolean }>({
    mutationFn: ({ announcementId, pinned }) =>
      setAnnouncementPin(pageId, announcementId, pinned),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: announcementsQueryKey(pageId) });
      void queryClient.invalidateQueries({
        queryKey: announcementDetailKeyRoot(variables.announcementId),
      });
    },
  });
}

export function useCreateAnnouncementComment(announcementId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, BccApiError, { body: string }>({
    mutationFn: ({ body }) => createAnnouncementComment({ announcementId, body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: announcementCommentsKeyRoot(announcementId),
      });
    },
  });
}

/**
 * Remove a comment (author's own, or operator moderation).
 *
 * Refetches rather than patching locally: the resulting tombstone's
 * label is **server-authored** and depends on who the server decided the
 * actor was. An operator removing their own comment is recorded as an
 * author removal, so the client genuinely cannot predict the copy.
 */
export function useRemoveAnnouncementComment(announcementId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, BccApiError, { commentId: string }>({
    mutationFn: ({ commentId }) =>
      removeAnnouncementComment({ announcementId, commentId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: announcementCommentsKeyRoot(announcementId),
      });
    },
  });
}
