"use client";

/**
 * useViewerWatch — one watch button's state and toggle, read from the
 * server's per-card answer (F-255 / H9).
 *
 * Every watch button used to work out "am I watching this?" by searching
 * the first page of `GET /me/watching?page_size=50`. Past the 50th watch
 * the answer was always "no": the button said Watch on something already
 * watched, and it could not be unwatched at all. There is no cap on watches
 * (user rule), so any page is partial. The server now puts the answer on
 * every page/member card and on the profile: `viewer_is_watching` plus
 * `viewer_watch = { follow_id, source }`, the exact handle DELETE takes.
 *
 * State:
 *   - `true` / `false` from the server, then the outcome of this viewer's
 *     own toggles (taken from the mutation RESPONSE, not a refetch — the
 *     profile read is cached for 30s, and grid data is a snapshot);
 *   - `null` = unknown (the server could not read it, or an older backend
 *     sent nothing). The button must not offer "Watch" then; `toggle` is a
 *     no-op and `unknown` is true so the caller can say why.
 *   - A changed server answer (a refetch) replaces the local outcome.
 *
 * Page cards with an owner: watching one follows the owner, so the owner's
 * OTHER pages are watched too. Their cards refresh when their own data
 * does; this hook only knows its own card.
 */

import { useState } from "react";

import { useUnwatchMutation, useWatchMutation, watchErrorCopy } from "@/hooks/useWatch";
import type { CardKind, ViewerWatch } from "@/lib/api/types";

export interface WatchTarget {
  card_kind: CardKind;
  id: number;
  viewer_is_watching?: boolean | null | undefined;
  viewer_watch?: ViewerWatch | null | undefined;
}

interface LocalOutcome {
  /** The server answer this outcome was layered on; a new answer drops it. */
  base: string;
  watch: ViewerWatch | null;
}

const answerKey = (t: WatchTarget) =>
  `${t.card_kind}:${t.id}:${String(t.viewer_is_watching)}:${t.viewer_watch?.follow_id ?? ""}:${t.viewer_watch?.source ?? ""}`;

export function useViewerWatch(
  target: WatchTarget,
  opts: { onChanged?: (watching: boolean) => void } = {},
) {
  const watchMutation = useWatchMutation();
  const unwatchMutation = useUnwatchMutation();
  const [local, setLocal] = useState<LocalOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = answerKey(target);
  const outcome = local !== null && local.base === base ? local : null;

  const serverKnown = target.viewer_is_watching === true || target.viewer_is_watching === false;
  const watch: ViewerWatch | null =
    outcome !== null ? outcome.watch : target.viewer_is_watching === true ? (target.viewer_watch ?? null) : null;
  const unknown = outcome === null && !serverKnown;
  const watching = outcome !== null ? outcome.watch !== null : target.viewer_is_watching === true;
  const pending = watchMutation.isPending || unwatchMutation.isPending;

  const toggle = () => {
    if (pending || unknown) return;
    setError(null);
    if (watching) {
      if (watch === null) {
        // Watched, but the server sent no handle to unwatch it with.
        setError(watchErrorCopy(null, "unwatch"));
        return;
      }
      unwatchMutation.mutate(
        { follow_id: watch.follow_id, source: watch.source, target: { card_kind: target.card_kind, id: target.id } },
        {
          onSuccess: () => {
            setLocal({ base, watch: null });
            opts.onChanged?.(false);
          },
          onError: (err) => setError(watchErrorCopy(err, "unwatch")),
        },
      );
      return;
    }
    watchMutation.mutate(
      { target_kind: target.card_kind, target_id: target.id },
      {
        onSuccess: (res) => {
          const now: ViewerWatch = { follow_id: res.item.follow_id, source: res.item.follow_source ?? "peepso" };
          setLocal({ base, watch: now });
          opts.onChanged?.(true);
        },
        onError: (err) => setError(watchErrorCopy(err, "watch")),
      },
    );
  };

  return { watching, unknown, pending, error, toggle, clearError: () => setError(null) };
}

/** Shown when the server could not say whether the viewer watches this. */
export const WATCH_UNKNOWN_COPY = "Couldn't check whether you're watching this. Reload to try again.";
