"use client";

/**
 * §V1.5 — X (Twitter) + GitHub identity connections.
 *
 * Lives on /settings/identity. Renders one card per provider with the
 * current connection status + a Connect/Disconnect button.
 *
 * Flow:
 *   - Connect  → call get*AuthUrl(), then `window.location.href = url`.
 *                The browser leaves Next.js. After OAuth completes the
 *                WP callback redirects back with `?x_verified=success`
 *                or `?github_verified=success` (or =error). The parent
 *                page parses those params and shows a toast + invalidates
 *                the status queries.
 *   - Disconnect → POST /{x|github}/disconnect (bearer JWT only — the
 *                  backend's previous wp_rest nonce check was removed
 *                  alongside this surface so headless callers work).
 *
 * Loading state: status query in flight → "Checking…". Connect mutation
 * in flight → button shows "Opening…". Disconnect → "Disconnecting…".
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  GITHUB_STATUS_QUERY_KEY,
  X_STATUS_QUERY_KEY,
  useDisconnectGitHub,
  useDisconnectX,
  useGitHubStatus,
  useStartGitHubConnect,
  useStartXConnect,
} from "@/hooks/useOAuthConnections";
import { useXStatus } from "@/hooks/useOAuthConnections";
import { formatShortDate } from "@/lib/format";
import type {
  BccApiError,
  GitHubStatusResponse,
  XStatusResponse,
} from "@/lib/api/types";

interface CallbackBanner {
  provider: "x" | "github";
  outcome: "success" | "error";
}

export function ConnectionsSection() {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<CallbackBanner | null>(null);

  // Parse ?x_verified / ?github_verified on mount, fire the matching
  // status invalidation, then strip the params so a refresh doesn't
  // re-show the banner.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const xParam = url.searchParams.get("x_verified");
    const ghParam = url.searchParams.get("github_verified");

    let next: CallbackBanner | null = null;
    if (xParam === "success" || xParam === "error") {
      next = { provider: "x", outcome: xParam };
      void queryClient.invalidateQueries({ queryKey: X_STATUS_QUERY_KEY });
    } else if (ghParam === "success" || ghParam === "error") {
      next = { provider: "github", outcome: ghParam };
      void queryClient.invalidateQueries({ queryKey: GITHUB_STATUS_QUERY_KEY });
    }
    if (next !== null) setBanner(next);

    if (xParam !== null || ghParam !== null) {
      url.searchParams.delete("x_verified");
      url.searchParams.delete("x_error");
      url.searchParams.delete("github_verified");
      window.history.replaceState({}, "", url.toString());
    }
  }, [queryClient]);

  return (
    <div className="bcc-panel flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          IDENTITY · CONNECTIONS
        </span>
        <h2 className="bcc-stencil text-2xl text-ink">Verified accounts</h2>
        <p className="font-serif text-sm text-ink-soft">
          Connect your X and GitHub to strengthen your identity. Each
          connection shows on your profile and feeds into your trust score.
        </p>
      </header>

      {banner !== null && (
        <CallbackBannerView banner={banner} onDismiss={() => setBanner(null)} />
      )}

      <XConnectionCard />
      <GitHubConnectionCard />
    </div>
  );
}

function CallbackBannerView({
  banner,
  onDismiss,
}: {
  banner: CallbackBanner;
  onDismiss: () => void;
}) {
  const providerLabel = banner.provider === "x" ? "X" : "GitHub";
  const successText = `${providerLabel} connected. Verification will reflect on your profile shortly.`;
  const errorText = `${providerLabel} verification failed. Try again — if it persists the OAuth app may not be configured.`;

  return (
    <div
      role="status"
      className={
        "flex items-start justify-between gap-3 border-2 px-4 py-3 " +
        (banner.outcome === "success"
          ? "border-verified/50 bg-verified/5"
          : "border-safety/50 bg-safety/5")
      }
      style={banner.outcome === "success" ? { color: "var(--verified)" } : undefined}
    >
      <span className="bcc-mono text-[11px] leading-relaxed">
        {banner.outcome === "success" ? successText : errorText}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="bcc-mono shrink-0 text-[10px] tracking-[0.18em] text-ink-soft hover:text-ink"
      >
        DISMISS
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// X
// ─────────────────────────────────────────────────────────────────────

function XConnectionCard() {
  const status = useXStatus();
  const [errorText, setErrorText] = useState<string | null>(null);

  const startConnect = useStartXConnect({
    onSuccess: (data) => {
      // Leave Next.js for X. The callback handler will redirect back
      // with ?x_verified=success or =error.
      window.location.href = data.auth_url;
    },
    onError: (err) => {
      setErrorText(humanizeOAuthError(err, "X"));
    },
  });

  const disconnect = useDisconnectX({
    onSuccess: () => {
      setErrorText(null);
    },
    onError: (err) => {
      setErrorText(humanizeOAuthError(err, "X"));
    },
  });

  return (
    <ProviderCard
      label="X (Twitter)"
      blurb="Show your @-handle on your profile and unlock the share-x quest."
      status={status.data}
      isStatusLoading={status.isLoading}
      isStatusError={status.isError}
      connectLabel="Connect X"
      connectingLabel="Opening X…"
      onConnect={() => {
        setErrorText(null);
        startConnect.mutate(undefined);
      }}
      isConnecting={startConnect.isPending}
      onDisconnect={() => {
        setErrorText(null);
        disconnect.mutate();
      }}
      isDisconnecting={disconnect.isPending}
      errorText={errorText}
      renderConnectedDetail={(data) =>
        data.connected ? (
          <div className="bcc-mono text-[11px] text-ink-soft">
            Linked as <span className="text-ink">@{data.username}</span>
            {data.verified_at !== null && (
              <> · since {formatShortDate(data.verified_at)}</>
            )}
          </div>
        ) : null
      }
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// GitHub
// ─────────────────────────────────────────────────────────────────────

function GitHubConnectionCard() {
  const status = useGitHubStatus();
  const [errorText, setErrorText] = useState<string | null>(null);

  const startConnect = useStartGitHubConnect({
    onSuccess: (data) => {
      window.location.href = data.auth_url;
    },
    onError: (err) => {
      setErrorText(humanizeOAuthError(err, "GitHub"));
    },
  });

  const disconnect = useDisconnectGitHub({
    onSuccess: () => {
      setErrorText(null);
    },
    onError: (err) => {
      setErrorText(humanizeOAuthError(err, "GitHub"));
    },
  });

  return (
    <ProviderCard
      label="GitHub"
      blurb="Show your repos, followers, and orgs on your profile."
      status={status.data}
      isStatusLoading={status.isLoading}
      isStatusError={status.isError}
      connectLabel="Connect GitHub"
      connectingLabel="Opening GitHub…"
      onConnect={() => {
        setErrorText(null);
        startConnect.mutate(undefined);
      }}
      isConnecting={startConnect.isPending}
      onDisconnect={() => {
        setErrorText(null);
        disconnect.mutate();
      }}
      isDisconnecting={disconnect.isPending}
      errorText={errorText}
      renderConnectedDetail={(data) =>
        data.connected ? (
          <div className="bcc-mono text-[11px] text-ink-soft">
            Linked as <span className="text-ink">@{data.username}</span>
            <span className="ml-2 text-ink-soft/70">
              {data.repos} repos · {data.followers} followers · {data.orgs} orgs
            </span>
            {data.verified_at !== null && (
              <> · since {formatShortDate(data.verified_at)}</>
            )}
          </div>
        ) : null
      }
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared card renderer
// ─────────────────────────────────────────────────────────────────────

interface ProviderCardProps<S extends XStatusResponse | GitHubStatusResponse> {
  label: string;
  blurb: string;
  status: S | undefined;
  isStatusLoading: boolean;
  isStatusError: boolean;
  connectLabel: string;
  connectingLabel: string;
  onConnect: () => void;
  isConnecting: boolean;
  onDisconnect: () => void;
  isDisconnecting: boolean;
  errorText: string | null;
  renderConnectedDetail: (status: S) => React.ReactNode;
}

function ProviderCard<S extends XStatusResponse | GitHubStatusResponse>({
  label,
  blurb,
  status,
  isStatusLoading,
  isStatusError,
  connectLabel,
  connectingLabel,
  onConnect,
  isConnecting,
  onDisconnect,
  isDisconnecting,
  errorText,
  renderConnectedDetail,
}: ProviderCardProps<S>) {
  const connected = status !== undefined && status.connected;

  return (
    <div className="flex flex-col gap-3 border border-cardstock-edge bg-cardstock-deep/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="bcc-stencil text-lg text-ink">{label}</h3>
          <p className="font-serif text-[13px] text-ink-soft">{blurb}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {isStatusLoading ? (
            <span className="bcc-mono text-[11px] text-ink-soft/70">Checking…</span>
          ) : isStatusError ? (
            <span className="bcc-mono text-[11px] text-safety">Status unavailable</span>
          ) : connected ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={isDisconnecting}
              className="bcc-mono border-2 border-cardstock-edge px-3 py-1.5 text-[11px] tracking-[0.18em] text-ink-soft hover:border-safety hover:text-safety disabled:opacity-50"
            >
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={isConnecting}
              className="bcc-stencil bg-ink px-4 py-2 text-[12px] tracking-[0.18em] text-cardstock transition hover:bg-blueprint disabled:opacity-50"
            >
              {isConnecting ? connectingLabel : connectLabel}
            </button>
          )}
        </div>
      </div>

      {status !== undefined && renderConnectedDetail(status)}

      {errorText !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {errorText}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function humanizeOAuthError(err: BccApiError, providerLabel: string): string {
  switch (err.code) {
    case "x_not_configured":
    case "github_not_configured":
      return `${providerLabel} OAuth isn't configured on the server. Ask an admin.`;
    case "rate_limited":
      return "Too many attempts. Wait a moment, then try again.";
    case "invalid_nonce":
      return "Session expired. Refresh the page and retry.";
    case "share_not_found":
      return "We couldn't find a recent tweet linking to this site. Tweet and try again.";
    case "bcc_unauthorized":
      return "Sign in required.";
    default:
      return err.message !== ""
        ? err.message
        : `${providerLabel} request failed. Try again.`;
  }
}


// ─────────────────────────────────────────────────────────────────────
// Callback-param toast — exported so the page can mount it once.
//
// Reads ?x_verified= and ?github_verified= from the URL on mount, then
// strips them. Triggers status invalidation by emitting a custom event
// the section listens to (avoids tight coupling to the page).
// ─────────────────────────────────────────────────────────────────────

interface CallbackToastProps {
  onResult: (provider: "x" | "github", outcome: "success" | "error") => void;
}

export function OAuthCallbackHandler({ onResult }: CallbackToastProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const xParam = url.searchParams.get("x_verified");
    const ghParam = url.searchParams.get("github_verified");

    if (xParam === "success" || xParam === "error") {
      onResult("x", xParam);
    }
    if (ghParam === "success" || ghParam === "error") {
      onResult("github", ghParam);
    }

    if (xParam !== null || ghParam !== null) {
      url.searchParams.delete("x_verified");
      url.searchParams.delete("x_error");
      url.searchParams.delete("github_verified");
      window.history.replaceState({}, "", url.toString());
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
