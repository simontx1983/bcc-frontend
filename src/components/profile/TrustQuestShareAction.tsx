"use client";

/**
 * Share-on-X action for the §N11 `share_x` quest on /me/progression.
 *
 * The quest completes when the operator tweets a link to their profile and
 * the backend (`POST /x/verify-share` → QuestValidator::validateShareX) finds
 * the tweet via the X API. This is the missing action surface: it opens the X
 * composer pre-filled with the operator's profile URL, then lets them ask the
 * server to verify. On a confirmed share it refreshes the server-rendered page
 * so the checklist and multiplier update.
 *
 * Requires a connected X account (the verifier needs the stored access token);
 * when X isn't connected yet, it points at the identity settings instead.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useVerifyXShare } from "@/hooks/useOAuthConnections";

const SETTINGS_IDENTITY = "/settings/identity" as Route;
const SHARE_TEXT = "Building trust on the floor at Blue Collar Crypto.";

const linkClass =
  "bcc-mono text-safety hover:underline underline-offset-4 disabled:opacity-50";

export function TrustQuestShareAction({
  handle,
  xVerified,
}: {
  handle: string;
  xVerified: boolean;
}) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const verify = useVerifyXShare({
    onSuccess: (data) => {
      if (data.verified) {
        // Re-fetch the server component so the quest row flips to done and
        // the multiplier picks up the new bonus.
        router.refresh();
      }
    },
  });

  if (!xVerified) {
    return (
      <Link href={SETTINGS_IDENTITY} className={linkClass}>
        Connect X first →
      </Link>
    );
  }

  function openComposer() {
    const url = `${window.location.origin}/u/${handle}`;
    const intent = `https://x.com/intent/post?${new URLSearchParams({
      text: SHARE_TEXT,
      url,
    }).toString()}`;
    window.open(intent, "_blank", "noopener,noreferrer");
    setOpened(true);
  }

  if (!opened) {
    return (
      <button type="button" onClick={openComposer} className={linkClass}>
        Share on X →
      </button>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => verify.mutate()}
        disabled={verify.isPending}
        className={linkClass}
      >
        {verify.isPending ? "Checking…" : "I've shared — verify"}
      </button>
      {verify.error !== null && (
        <span className="bcc-mono text-[10px] text-weld">
          {verify.error.code === "share_not_found"
            ? "No matching tweet found yet."
            : verify.error.code === "bcc_rate_limited"
              ? "Too many tries — wait a minute."
              : "Couldn't verify. Try again."}
        </span>
      )}
    </span>
  );
}
