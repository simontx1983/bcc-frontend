"use client";

/**
 * GroupPostPolicyToggle — CL-FN06 leader control on the §4.7.6 group
 * feed surface: may ordinary members set `visibility=public_all`
 * (syndicate a group post to the main feed)?
 *
 * Mounts ONLY when the group detail says
 * `can_manage_public_all_policy === true` (owner / manager /
 * site-admin — moderators may USE public_all but never manage the
 * policy). That is also exactly when `public_all_members_enabled`
 * carries the real value (minimum exposure: non-managers always read
 * `false`), so the seed prop is trustworthy here.
 *
 * State model: the mutation response's `public_all_members_enabled`
 * is server truth and drives the local display immediately;
 * `router.refresh()` then re-fetches the SSR'd page so the rest of
 * the detail view-model (other members' `can_use_public_all`) catches
 * up, and the refreshed prop re-seeds the local state (covers a
 * second manager flipping the policy concurrently). No optimistic
 * flip — the switch only moves on confirmed values.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSetGroupPostPolicyMutation } from "@/hooks/useMyGroups";
import { humanizeCode } from "@/lib/api/errors";

interface GroupPostPolicyToggleProps {
  groupId: number;
  /** Seed value from the group detail (`public_all_members_enabled`). */
  enabled: boolean;
}

export function GroupPostPolicyToggle({
  groupId,
  enabled,
}: GroupPostPolicyToggleProps) {
  const router = useRouter();
  // Server-confirmed value. Seeded from the SSR'd detail; replaced by
  // each mutation response (which echoes post-write truth).
  const [confirmed, setConfirmed] = useState(enabled);

  // When router.refresh() lands a new server value (ours, or another
  // manager's concurrent change), server truth wins over the copy.
  useEffect(() => {
    setConfirmed(enabled);
  }, [enabled]);

  const mutation = useSetGroupPostPolicyMutation({
    onSuccess: (response) => {
      setConfirmed(response.public_all_members_enabled);
      router.refresh();
    },
  });

  const errorMessage = mutation.error
    ? humanizeCode(
        mutation.error,
        {
          bcc_unauthorized: "Sign in again to change this setting.",
          bcc_permission_denied: "Only the group's leaders can change this.",
          bcc_rate_limited: "Too many changes — wait a minute and try again.",
        },
        "Couldn't update the posting policy. Try again."
      )
    : null;
  const errorId = `bcc-post-policy-error-${groupId}`;

  return (
    <section className="rounded-sm border border-[var(--bcc-border)] bg-[var(--bcc-surface-hover)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="bcc-stencil text-[12px] tracking-[0.2em] text-[var(--bcc-text)]">
            Main-feed posting
          </h3>
          <p className="mt-1 font-serif text-[13px] leading-snug text-[var(--bcc-text-secondary)]">
            {confirmed
              ? "Any member can mark a post PUBLIC — it shows in this group and on the main feed."
              : "Only leaders can mark a post PUBLIC. Members' posts stay inside the group."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={confirmed}
          aria-label="Let all members post to the main feed"
          aria-describedby={errorMessage !== null ? errorId : undefined}
          disabled={mutation.isPending}
          onClick={() => {
            mutation.reset();
            mutation.mutate({ groupId, publicAllMembers: !confirmed });
          }}
          className="bcc-mono inline-flex shrink-0 items-center border-2 border-[var(--bcc-border-strong)] px-3 py-1.5 text-[11px] tracking-[0.18em] text-[var(--bcc-text-secondary)] transition motion-reduce:transition-none hover:text-[var(--bcc-text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending
            ? "SAVING…"
            : confirmed
              ? "ALL MEMBERS"
              : "LEADERS ONLY"}
        </button>
      </div>
      {errorMessage !== null && (
        <p
          id={errorId}
          role="alert"
          className="bcc-mono mt-2 text-[10px] tracking-[0.12em] text-safety"
        >
          {errorMessage}
        </p>
      )}
    </section>
  );
}
