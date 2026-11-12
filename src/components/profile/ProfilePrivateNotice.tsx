/**
 * The "this profile is private" state (contract v1.91, F-02), and the one
 * place a profile read's failure branch decides between it and a failure.
 *
 * A private profile is the owner's choice, not an outage and not the
 * viewer's fault, so this is deliberately NOT `LoadFailure`: no alert role,
 * no error colour, no disconnected glyph, and never a Retry — the owner's
 * setting does not change because the same read is repeated.
 *
 * Shared by the profile page (`ProfileUnavailable reason="private"`) and
 * every profile tab panel, so the copy cannot drift between them.
 */

import { Lock } from "lucide-react";

import { LoadFailure } from "@/components/ui/LoadFailure";
import { isProfilePrivate } from "@/lib/api/errors";

type Surface = "theme" | "paper";

const PROFILE_PRIVATE_HEADING = "This profile is private.";
const PROFILE_PRIVATE_DETAIL = "Only people the owner has chosen can see it.";

/** Text and glyph tokens per surface family (doctrine §5.3). */
const TOKENS: Record<Surface, { glyph: string; heading: string; detail: string }> = {
  theme: {
    glyph: "text-bcc-text-secondary",
    heading: "text-bcc-text",
    detail: "text-bcc-text-secondary",
  },
  paper: {
    glyph: "text-ink-ghost",
    heading: "text-ink",
    detail: "text-ink-soft",
  },
};

/**
 * Copy override for a surface that is not the profile itself — e.g. an
 * entity page's Watchers tab, withheld because its OWNER's profile is not
 * viewable (F-26). Same state, same no-Retry rule; only the words change.
 */
export interface PrivateNoticeCopy {
  heading: string;
  detail: string;
}

export function ProfilePrivateNotice({
  surface = "theme",
  copy,
}: {
  surface?: Surface;
  copy?: PrivateNoticeCopy;
}) {
  const tokens = TOKENS[surface];
  const heading = copy?.heading ?? PROFILE_PRIVATE_HEADING;
  const detail = copy?.detail ?? PROFILE_PRIVATE_DETAIL;
  return (
    <div
      role="status"
      data-testid="profile-private"
      className="flex flex-col items-center gap-2 py-8 text-center"
    >
      <Lock size={22} strokeWidth={1.6} aria-hidden className={tokens.glyph} />
      <p className={"bcc-stencil text-[17px] " + tokens.heading}>{heading}</p>
      <p className={"font-serif text-[13px] italic " + tokens.detail}>{detail}</p>
    </div>
  );
}

/**
 * Drop-in for `LoadFailure` in a profile read's error branch: a
 * `profile_private` refusal renders the private state (and ignores
 * `onRetry`); anything else renders exactly the `LoadFailure` the caller
 * asked for, so `bcc_permission_denied` and transient failures keep their
 * existing copy and recovery.
 */
export function ProfileReadFailure({
  error,
  message,
  onRetry,
  surface = "theme",
  privateCopy,
}: {
  error: unknown;
  message: string;
  onRetry?: () => void;
  surface?: Surface;
  privateCopy?: PrivateNoticeCopy;
}) {
  if (isProfilePrivate(error)) {
    return (
      <ProfilePrivateNotice
        surface={surface}
        {...(privateCopy !== undefined ? { copy: privateCopy } : {})}
      />
    );
  }
  return (
    <LoadFailure
      message={message}
      surface={surface}
      {...(onRetry !== undefined ? { onRetry } : {})}
    />
  );
}
