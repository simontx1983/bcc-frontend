"use client";

/**
 * useCardReviews / useCardDisputes / useCardWatchers — lazy-load hooks
 * for the §Phase 2 entity-profile tab strip.
 *
 * Same single-page useQuery shape as useUserReviews / useUserDisputes
 * / useUserFollowers — the FE component just changes which key it
 * passes (kind + cardId instead of handle).
 *
 * staleTime 30_000 matches each endpoint's `private, max-age=30` cache
 * header so a tab toggle inside the window doesn't re-fetch.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getCardDisputes,
  getCardReviews,
  getCardWatchers,
} from "@/lib/api/card-tabs-endpoints";
import type {
  BccApiError,
  CardDisputesResponse,
  CardReviewsResponse,
  CardWatchersResponse,
  EntityCardKind,
} from "@/lib/api/types";

const DEFAULT_PER_PAGE = 20;
const DEFAULT_LIMIT    = 24;

export const CARD_REVIEWS_QUERY_KEY_ROOT  = ["entities", "reviews"]  as const;
export const CARD_DISPUTES_QUERY_KEY_ROOT = ["entities", "disputes"] as const;
export const CARD_WATCHERS_QUERY_KEY_ROOT = ["entities", "watchers"] as const;

export function useCardReviews(
  kind: EntityCardKind,
  id: number,
  page: number = 1,
) {
  return useQuery<CardReviewsResponse, BccApiError>({
    queryKey: [...CARD_REVIEWS_QUERY_KEY_ROOT, kind, id, page],
    queryFn: ({ signal }) =>
      getCardReviews(kind, id, { page, perPage: DEFAULT_PER_PAGE }, signal),
    enabled: id > 0,
    staleTime: 30_000,
  });
}

export function useCardDisputes(
  kind: EntityCardKind,
  id: number,
  page: number = 1,
) {
  return useQuery<CardDisputesResponse, BccApiError>({
    queryKey: [...CARD_DISPUTES_QUERY_KEY_ROOT, kind, id, page],
    queryFn: ({ signal }) =>
      getCardDisputes(kind, id, { page, perPage: DEFAULT_PER_PAGE }, signal),
    enabled: id > 0,
    staleTime: 30_000,
  });
}

export function useCardWatchers(
  kind: EntityCardKind,
  id: number,
  offset: number = 0,
) {
  return useQuery<CardWatchersResponse, BccApiError>({
    queryKey: [...CARD_WATCHERS_QUERY_KEY_ROOT, kind, id, offset],
    queryFn: ({ signal }) =>
      getCardWatchers(kind, id, { offset, limit: DEFAULT_LIMIT }, signal),
    enabled: id > 0,
    staleTime: 30_000,
  });
}
