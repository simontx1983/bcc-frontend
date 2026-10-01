/**
 * The session boundary — ordering, single-flight, bounded push cleanup,
 * sign-out failure, late responses and cross-tab viewer changes.
 *
 * Every case here is a security property, so each is asserted on the
 * observable consequence rather than on "the function was called".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PUSH_CLEANUP_TIMEOUT_MS,
  SIGN_OUT_TIMEOUT_MS,
  __resetSessionBoundaryForTests,
  currentViewerEpoch,
  endSession,
  isEndingSession,
  isPrivateRenderBlocked,
  isStaleEpoch,
  purgeViewerState,
  failedTeardownResult,
  registerSessionTeardown,
  subscribePrivateRenderGate,
  type PushCleanupOutcome,
  type SessionTeardownHandlers,
} from "@/lib/auth/session-boundary";

/** Where signOut was asked to land. */
let signOutTargets: string[] = [];

/** Records the order steps ran in — ordering IS the security property. */
let order: string[] = [];

function handlers(
  over: Partial<SessionTeardownHandlers> = {},
): SessionTeardownHandlers {
  return {
    purgeQueryCache: () => {
      order.push("purgeQueryCache");
    },
    purgeViewerStorage: () => {
      order.push("purgeViewerStorage");
      return "cleared" as const;
    },
    purgeArrivalStorage: () => {
      order.push("purgeArrivalStorage");
      return "cleared" as const;
    },
    invalidateQueryCache: () => {
      order.push("invalidateQueryCache");
    },
    revokePush: async () => {
      order.push("revokePush");
      return "revoked" as PushCleanupOutcome;
    },
    signOut: async (callbackUrl: string) => {
      order.push("signOut");
      signOutTargets.push(callbackUrl);
    },
    ...over,
  };
}

beforeEach(() => {
  order = [];
  signOutTargets = [];
  __resetSessionBoundaryForTests();
  vi.useRealTimers();
});

afterEach(() => {
  __resetSessionBoundaryForTests();
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────
// Ordering
// ─────────────────────────────────────────────────────────────────────

describe("teardown order", () => {
  it("revokes push BEFORE signing out — the DELETE needs the live session", async () => {
    registerSessionTeardown(handlers());
    await endSession("user");
    expect(order.indexOf("revokePush")).toBeLessThan(order.indexOf("signOut"));
  });

  it("clears local state BEFORE signing out, so a failed sign-out still hides data", async () => {
    registerSessionTeardown(handlers());
    await endSession("user");
    expect(order.indexOf("purgeQueryCache")).toBeLessThan(order.indexOf("signOut"));
    expect(order.indexOf("purgeViewerStorage")).toBeLessThan(order.indexOf("signOut"));
  });

  it("runs every step on a normal sign-out", async () => {
    registerSessionTeardown(handlers());
    const result = await endSession("user");
    // The cache purge runs FIRST, in the same synchronous step as the
    // render gate. It used to sit after the push await, which left up to
    // PUSH_CLEANUP_TIMEOUT_MS during which the viewer epoch had not moved
    // and in-flight requests carrying the departing viewer's bearer could
    // still resolve into the cache.
    expect(order).toEqual([
      "purgeQueryCache",
      "revokePush",
      "purgeViewerStorage",
      "signOut",
    ]);
    expect(result).toMatchObject({
      reason: "user",
      localStateCleared: true,
      signedOut: true,
      signOutTimedOut: false,
      storagePurge: "cleared",
      pushCleanup: "revoked",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Single-flight — concurrent expiry
// ─────────────────────────────────────────────────────────────────────

describe("concurrent expiry is single-flight", () => {
  it("five simultaneous 401s produce exactly ONE teardown", async () => {
    let signOuts = 0;
    registerSessionTeardown(
      handlers({
        signOut: async () => {
          signOuts += 1;
          await new Promise((r) => setTimeout(r, 10));
        },
      }),
    );

    const results = await Promise.all([
      endSession("expired"),
      endSession("expired"),
      endSession("expired"),
      endSession("expired"),
      endSession("expired"),
    ]);

    expect(signOuts).toBe(1);
    expect(order.filter((o) => o === "purgeQueryCache")).toHaveLength(1);
    // All callers observe the same outcome.
    expect(new Set(results).size).toBe(1);
  });

  it("reports in-flight status, and allows a later teardown once settled", async () => {
    registerSessionTeardown(handlers());
    expect(isEndingSession()).toBe(false);
    const p = endSession("expired");
    expect(isEndingSession()).toBe(true);
    await p;
    expect(isEndingSession()).toBe(false);

    order = [];
    await endSession("user");
    expect(order).toContain("signOut");
  });

  it("a user-initiated sign-out racing an expiry does not double-run", async () => {
    let signOuts = 0;
    registerSessionTeardown(
      handlers({
        signOut: async () => {
          signOuts += 1;
        },
      }),
    );
    await Promise.all([endSession("user"), endSession("expired")]);
    expect(signOuts).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Push cleanup is bounded and honest
// ─────────────────────────────────────────────────────────────────────

describe("push cleanup never blocks logout", () => {
  it("a HANGING unsubscribe still signs the viewer out, reported as timed-out", async () => {
    vi.useFakeTimers();
    registerSessionTeardown(
      handlers({
        // Never settles — the exact shape of a wedged service worker.
        revokePush: () => new Promise<PushCleanupOutcome>(() => {}),
      }),
    );

    const promise = endSession("user");
    await vi.advanceTimersByTimeAsync(PUSH_CLEANUP_TIMEOUT_MS + 50);
    const result = await promise;

    expect(result.signedOut).toBe(true);
    expect(result.localStateCleared).toBe(true);
    expect(result.pushCleanup).toBe("timed-out");
    expect(order).toContain("signOut");
  });

  it("a REJECTING push cleanup still signs the viewer out", async () => {
    registerSessionTeardown(
      handlers({
        revokePush: async () => {
          throw new Error("service worker exploded");
        },
      }),
    );
    const result = await endSession("user");
    expect(result.signedOut).toBe(true);
    expect(result.pushCleanup).toBe("unsubscribe-failed");
  });

  it("does NOT claim success when the browser refused to unsubscribe", async () => {
    registerSessionTeardown(
      handlers({ revokePush: async () => "unsubscribe-failed" }),
    );
    const result = await endSession("user");
    expect(result.pushCleanup).not.toBe("revoked");
    expect(result.pushCleanup).toBe("unsubscribe-failed");
  });

  it("distinguishes a local-only unsubscribe from a full revocation", async () => {
    registerSessionTeardown(
      handlers({ revokePush: async () => "unsubscribed-locally" }),
    );
    const result = await endSession("user");
    // The browser endpoint is gone, but we must not imply the server row
    // was deleted when we never had its id.
    expect(result.pushCleanup).toBe("unsubscribed-locally");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Sign-out failure
// ─────────────────────────────────────────────────────────────────────

describe("sign-out failure", () => {
  it("reports failure while confirming local state was still cleared", async () => {
    const boom = new Error("network down");
    registerSessionTeardown(
      handlers({
        signOut: async () => {
          throw boom;
        },
      }),
    );
    const result = await endSession("user");

    expect(result.signedOut).toBe(false);
    expect(result.signOutError).toBe(boom);
    // The load-bearing half: private data is off screen regardless.
    expect(result.localStateCleared).toBe(true);
    expect(order).toContain("purgeQueryCache");
  });

  it("never rejects, so a caller cannot be stranded on a pending state", async () => {
    registerSessionTeardown(
      handlers({
        purgeQueryCache: () => {
          throw new Error("cache purge exploded");
        },
        purgeViewerStorage: () => {
          throw new Error("storage blocked");
        },
        signOut: async () => {
          throw new Error("signout exploded");
        },
        revokePush: async () => {
          throw new Error("push exploded");
        },
      }),
    );
    await expect(endSession("user")).resolves.toBeDefined();
  });

  it("a throwing cache purge does not stop the storage purge", async () => {
    registerSessionTeardown(
      handlers({
        purgeQueryCache: () => {
          order.push("purgeQueryCache");
          throw new Error("boom");
        },
      }),
    );
    await endSession("user");
    expect(order).toContain("purgeViewerStorage");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Late responses / viewer epoch
// ─────────────────────────────────────────────────────────────────────

describe("the viewer epoch invalidates late responses", () => {
  it("a read that started before the boundary is stale afterwards", async () => {
    registerSessionTeardown(handlers());
    const epochAtDispatch = currentViewerEpoch();
    expect(isStaleEpoch(epochAtDispatch)).toBe(false);

    await endSession("expired");

    // This is what stops viewer A's in-flight payload being handed back.
    expect(isStaleEpoch(epochAtDispatch)).toBe(true);
  });

  it("a read started AFTER the boundary is not stale", async () => {
    registerSessionTeardown(handlers());
    await endSession("expired");
    const epochAfter = currentViewerEpoch();
    expect(isStaleEpoch(epochAfter)).toBe(false);
  });

  it("each viewer change advances the epoch again", () => {
    registerSessionTeardown(handlers());
    const first = currentViewerEpoch();
    purgeViewerState();
    const second = currentViewerEpoch();
    purgeViewerState();
    expect(second).not.toBe(first);
    expect(currentViewerEpoch()).not.toBe(second);
    expect(isStaleEpoch(first)).toBe(true);
    expect(isStaleEpoch(second)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cross-tab viewer change
// ─────────────────────────────────────────────────────────────────────

describe("a viewer change from another tab", () => {
  it("purges local state WITHOUT signing out again", () => {
    registerSessionTeardown(handlers());
    purgeViewerState();
    expect(order).toEqual(["purgeQueryCache", "purgeViewerStorage"]);
    // The other tab already signed out; a second call would race it.
    expect(order).not.toContain("signOut");
    expect(order).not.toContain("revokePush");
  });

  it("survives storage that throws", () => {
    registerSessionTeardown(
      handlers({
        purgeViewerStorage: () => {
          throw new Error("localStorage blocked");
        },
      }),
    );
    expect(() => purgeViewerState()).not.toThrow();
    expect(order).toContain("purgeQueryCache");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Registration hygiene
// ─────────────────────────────────────────────────────────────────────

describe("registration", () => {
  it("is a no-op when nothing is registered, rather than throwing", async () => {
    const result = await endSession("user");
    expect(result.signedOut).toBe(false);
    expect(result.localStateCleared).toBe(false);
  });

  it("unregister drops the handlers so a remount cannot leave a stale closure", async () => {
    const unregister = registerSessionTeardown(handlers());
    unregister();
    await endSession("user");
    expect(order).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The render gate — what actually hides the departing viewer's data
// ─────────────────────────────────────────────────────────────────────

describe("the private-render gate", () => {
  it("closes SYNCHRONOUSLY, before any await in the teardown", () => {
    registerSessionTeardown(
      handlers({
        // If the gate only closed after this resolved, private content
        // would stay rendered for the whole push budget.
        revokePush: () => new Promise<PushCleanupOutcome>(() => {}),
      }),
    );
    expect(isPrivateRenderBlocked()).toBe(false);
    void endSession("user");
    // No await: the gate must already be shut.
    expect(isPrivateRenderBlocked()).toBe(true);
  });

  it("notifies subscribers so React can unmount the subtree", () => {
    registerSessionTeardown(handlers());
    const seen: boolean[] = [];
    const unsubscribe = subscribePrivateRenderGate(() => {
      seen.push(isPrivateRenderBlocked());
    });
    void endSession("user");
    unsubscribe();
    expect(seen).toContain(true);
  });

  it("closes on a cross-tab purge too, not just a full teardown", () => {
    registerSessionTeardown(handlers());
    purgeViewerState();
    expect(isPrivateRenderBlocked()).toBe(true);
  });

  it("closes even when nothing is registered", () => {
    // A teardown with no provider still must not leave private content up.
    void endSession("expired");
    expect(isPrivateRenderBlocked()).toBe(true);
  });

  it("survives a subscriber that throws", () => {
    registerSessionTeardown(handlers());
    const good: boolean[] = [];
    subscribePrivateRenderGate(() => {
      throw new Error("bad subscriber");
    });
    subscribePrivateRenderGate(() => {
      good.push(true);
    });
    expect(() => purgeViewerState()).not.toThrow();
    expect(good).toEqual([true]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The sign-out step is bounded too
// ─────────────────────────────────────────────────────────────────────

describe("a STALLED sign-out", () => {
  it("gives up at the budget instead of hanging forever", async () => {
    vi.useFakeTimers();
    registerSessionTeardown(
      handlers({
        // A wedged /api/auth/signout — next-auth awaits a fetch with no
        // timeout of its own, so this used to pend indefinitely and strand
        // the UI on "Signing out…".
        signOut: () => new Promise<void>(() => {}),
      }),
    );
    const promise = endSession("user");
    await vi.advanceTimersByTimeAsync(SIGN_OUT_TIMEOUT_MS + 100);
    const result = await promise;

    expect(result.signOutTimedOut).toBe(true);
    expect(result.signedOut).toBe(false);
    // And the important half: private content is hidden regardless.
    expect(result.localStateCleared).toBe(true);
    expect(isPrivateRenderBlocked()).toBe(true);
  });

  it("does not report a timeout when sign-out merely fails", async () => {
    registerSessionTeardown(
      handlers({
        signOut: async () => {
          throw new Error("502");
        },
      }),
    );
    const result = await endSession("user");
    expect(result.signedOut).toBe(false);
    expect(result.signOutTimedOut).toBe(false);
    expect(result.signOutError).toBeInstanceOf(Error);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Carrying an explanation through the navigation
// ─────────────────────────────────────────────────────────────────────

describe("the landing URL", () => {
  it("defaults to / with no notice", async () => {
    registerSessionTeardown(handlers());
    await endSession("user");
    expect(signOutTargets).toEqual(["/"]);
  });

  it("carries an explicit notice slug", async () => {
    registerSessionTeardown(handlers());
    await endSession("expired", { notice: "standing" });
    expect(signOutTargets).toEqual(["/?authNotice=standing"]);
  });

  it("honours a custom callbackUrl", async () => {
    registerSessionTeardown(handlers());
    await endSession("user", { callbackUrl: "/login" });
    expect(signOutTargets).toEqual(["/login"]);
  });

  it("joins with & when the callbackUrl already has a query", async () => {
    registerSessionTeardown(handlers());
    await endSession("user", { callbackUrl: "/login?next=%2Ffeed", notice: "standing" });
    expect(signOutTargets).toEqual(["/login?next=%2Ffeed&authNotice=standing"]);
  });

  it("surfaces a push warning through the navigation when nothing else would", async () => {
    // The warning cannot live in the modal: a successful sign-out navigates
    // and destroys it. A slug is the only thing that survives.
    registerSessionTeardown(
      handlers({ revokePush: async () => "unsubscribe-failed" }),
    );
    await endSession("user");
    expect(signOutTargets).toEqual(["/?authNotice=push-cleanup"]);
  });

  it("does NOT add a push slug when cleanup succeeded", async () => {
    registerSessionTeardown(handlers({ revokePush: async () => "revoked" }));
    await endSession("user");
    expect(signOutTargets).toEqual(["/"]);
  });

  it("prefers an explicit notice over the push warning", async () => {
    registerSessionTeardown(
      handlers({ revokePush: async () => "timed-out" }),
    );
    await endSession("expired", { notice: "standing" });
    expect(signOutTargets).toEqual(["/?authNotice=standing"]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Storage outcome is reported, not assumed
// ─────────────────────────────────────────────────────────────────────

describe("the storage purge outcome reaches the caller", () => {
  it("reports partial when storage could not be fully cleared", async () => {
    registerSessionTeardown(
      handlers({ purgeViewerStorage: () => "partial" }),
    );
    const result = await endSession("user");
    expect(result.storagePurge).toBe("partial");
  });

  it("reports partial when the purge throws outright", async () => {
    registerSessionTeardown(
      handlers({
        purgeViewerStorage: () => {
          throw new Error("SecurityError");
        },
      }),
    );
    const result = await endSession("user");
    expect(result.storagePurge).toBe("partial");
    // Still signed out — storage trouble cannot block the teardown.
    expect(result.signedOut).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// A retried teardown must not wear the previous attempt's result
// ─────────────────────────────────────────────────────────────────────

describe("a retried teardown", () => {
  it("clears the previous failure before running", async () => {
    // `inFlight` was reset in a finally, but `failedTeardown` was not, so
    // a second endSession ran while the gate still displayed the FIRST
    // failure's panel — including its stale storagePurge and pushCleanup
    // claims, which describe an attempt that is no longer happening.
    registerSessionTeardown(
      handlers({
        signOut: async () => {
          throw new Error("502");
        },
        revokePush: async () => "unsubscribe-failed",
      }),
    );
    await endSession("user");
    expect(failedTeardownResult()).not.toBeNull();
    expect(failedTeardownResult()?.pushCleanup).toBe("unsubscribe-failed");

    // Second attempt: push now succeeds and sign-out works.
    let seenDuringRun: ReturnType<typeof failedTeardownResult> = null;
    registerSessionTeardown(
      handlers({
        revokePush: async () => "revoked",
        signOut: async () => {
          seenDuringRun = failedTeardownResult();
        },
      }),
    );
    await endSession("user");

    // While the retry was running, no stale panel was on offer.
    expect(seenDuringRun).toBeNull();
    expect(failedTeardownResult()).toBeNull();
  });
});
