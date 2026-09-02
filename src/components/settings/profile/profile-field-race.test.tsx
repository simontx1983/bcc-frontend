/**
 * Profile-field saves: two mutations, one row, no clobbering.
 *
 * ## The defect this pins
 *
 * A row can save its value and its visibility at once — two independent
 * requests. Server-side they are disjoint writes (`$field->save()` vs
 * `$field->save_acc()`), but BOTH endpoints reload the field afterwards and
 * return the SAME full `buildItem()` payload
 * (MyProfileFieldsEndpoint.php:376-396). So each response carries a snapshot
 * of the OTHER property, taken whenever that request happened to reload.
 *
 * The cache merge replaced the whole field object with whichever response
 * arrived last. Failing interleaving:
 *
 *   1. value request saves, then reloads — visibility write has not landed,
 *      so its snapshot carries the OLD visibility;
 *   2. visibility request saves and returns the new visibility;
 *   3. the value response arrives LAST and overwrites it.
 *
 * The database is correct; the cache is not. The row then re-reports itself
 * dirty for a change that did persist, and the draft-sync effect rewrites
 * the user's selection back to the stale value.
 *
 * A second bug compounded it: one effect keyed on `[field.value,
 * field.visibility]` reset BOTH drafts, so a successful value merge also
 * discarded a visibility choice whose own request had failed — flipping the
 * row clean and leaving nothing to retry.
 *
 * ## How these tests are built
 *
 * Arrival order is the whole subject, so it is controlled explicitly:
 * `patchProfileFieldValue` / `patchProfileFieldVisibility` are mocked with
 * deferred promises that each test resolves in the order it wants. Every
 * scenario runs BOTH ways round. Assertions read the real React Query cache,
 * not a render, so they describe what the next consumer would actually see.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const patchValue = vi.fn();
const patchVisibility = vi.fn();

vi.mock("@/lib/api/profile-fields-endpoints", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    patchProfileFieldValue: (...a: unknown[]) => patchValue(...a),
    patchProfileFieldVisibility: (...a: unknown[]) => patchVisibility(...a),
  };
});

import {
  PROFILE_FIELDS_QUERY_KEY,
  useUpdateProfileFieldValue,
  useUpdateProfileFieldVisibility,
} from "@/hooks/useProfileFields";
import type {
  ProfileField,
  ProfileFieldsResponse,
} from "@/lib/api/profile-fields-endpoints";

// ── fixtures ─────────────────────────────────────────────────────────────

const FIELD: ProfileField = {
  key: "trade",
  label: "Trade",
  help_text: null,
  type: "text",
  value: "old value",
  visibility: "private",
  visibility_locked: false,
  editable: true,
  required: false,
  max_length: null,
  options: [],
  order: 1,
} as unknown as ProfileField;

const SEED: ProfileFieldsResponse = {
  fields: [FIELD],
  stats: { filled: 1, total: 1, completeness: 100 },
} as unknown as ProfileFieldsResponse;

/**
 * A full server payload, exactly as either endpoint builds it — including a
 * copy of the property that endpoint does NOT own. That copy is the hazard.
 */
function payload(over: Partial<ProfileField>): ProfileField {
  return { ...FIELD, ...over };
}

/** A promise whose resolution this test controls. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;

function cache(): ProfileFieldsResponse | undefined {
  return client.getQueryData<ProfileFieldsResponse>(PROFILE_FIELDS_QUERY_KEY);
}
function cachedField(): ProfileField {
  const f = cache()?.fields[0];
  if (f === undefined) throw new Error("field missing from cache");
  return f;
}

/** Drives both mutations from one component, the way a row does. */
interface Api {
  saveValue: (v: string) => void;
  saveVisibility: (v: ProfileField["visibility"]) => void;
  valueState: () => { isError: boolean; isSuccess: boolean };
  visibilityState: () => { isError: boolean; isSuccess: boolean };
}
let api: Api;

function Harness() {
  const value = useUpdateProfileFieldValue();
  const visibility = useUpdateProfileFieldVisibility();
  api = {
    saveValue: (v) => value.mutate({ key: "trade", value: v }),
    saveVisibility: (v) => visibility.mutate({ key: "trade", visibility: v }),
    valueState: () => ({ isError: value.isError, isSuccess: value.isSuccess }),
    visibilityState: () => ({
      isError: visibility.isError,
      isSuccess: visibility.isSuccess,
    }),
  };
  return null;
}

beforeEach(() => {
  patchValue.mockReset();
  patchVisibility.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(PROFILE_FIELDS_QUERY_KEY, SEED);
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
});

afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────
// 0. Preconditions
// ─────────────────────────────────────────────────────────────────────────

describe("preconditions", () => {
  it("seeds a cache the assertions can actually move", () => {
    expect(cachedField().value).toBe("old value");
    expect(cachedField().visibility).toBe("private");
  });

  it("each endpoint's payload really does carry the other property", () => {
    // If this ever stopped being true the race would be gone — and so would
    // the reason for the owned-property merge. Pin it.
    const fromValueEndpoint = payload({ value: "new value" });
    expect(fromValueEndpoint.visibility).toBe("private");
    const fromVisibilityEndpoint = payload({ visibility: "public" });
    expect(fromVisibilityEndpoint.value).toBe("old value");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 1. Both succeed — under both arrival orders
// ─────────────────────────────────────────────────────────────────────────

describe("both halves succeed", () => {
  /**
   * The stale copies are deliberately maximal: each response reports the
   * other property at its PRE-save value, which is the worst case the
   * server can actually produce.
   */
  async function run(order: "value-first" | "visibility-first") {
    const v = deferred<ProfileField>();
    const s = deferred<ProfileField>();
    patchValue.mockReturnValue(v.promise);
    patchVisibility.mockReturnValue(s.promise);

    act(() => {
      api.saveValue("new value");
      api.saveVisibility("public");
    });

    const resolveValue = () =>
      v.resolve(payload({ value: "new value", visibility: "private" }));
    const resolveVisibility = () =>
      s.resolve(payload({ value: "old value", visibility: "public" }));

    if (order === "value-first") {
      await act(async () => {
        resolveValue();
        await v.promise;
      });
      await act(async () => {
        resolveVisibility();
        await s.promise;
      });
    } else {
      await act(async () => {
        resolveVisibility();
        await s.promise;
      });
      await act(async () => {
        resolveValue();
        await v.promise;
      });
    }

    await waitFor(() => {
      expect(api.valueState().isSuccess).toBe(true);
      expect(api.visibilityState().isSuccess).toBe(true);
    });
  }

  it("value resolves first — both changes survive", async () => {
    await run("value-first");
    expect(cachedField().value).toBe("new value");
    expect(cachedField().visibility).toBe("public");
  });

  it("visibility resolves first — both changes survive", async () => {
    await run("visibility-first");
    expect(cachedField().value).toBe("new value");
    expect(cachedField().visibility).toBe("public");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Partial failures — the successful half must land and stay landed
// ─────────────────────────────────────────────────────────────────────────

describe("one half fails", () => {
  it("value succeeds, visibility fails — value lands, visibility untouched", async () => {
    const v = deferred<ProfileField>();
    const s = deferred<ProfileField>();
    patchValue.mockReturnValue(v.promise);
    patchVisibility.mockReturnValue(s.promise);

    act(() => {
      api.saveValue("new value");
      api.saveVisibility("public");
    });

    await act(async () => {
      s.reject(new Error("boom"));
      await s.promise.catch(() => {});
    });
    await act(async () => {
      v.resolve(payload({ value: "new value", visibility: "private" }));
      await v.promise;
    });

    await waitFor(() => expect(api.valueState().isSuccess).toBe(true));
    expect(api.visibilityState().isError).toBe(true);
    expect(cachedField().value).toBe("new value");
    // Unchanged, not reverted — the failed write never reached the server.
    expect(cachedField().visibility).toBe("private");
  });

  it("visibility succeeds, value fails — visibility survives the failing response", async () => {
    const v = deferred<ProfileField>();
    const s = deferred<ProfileField>();
    patchValue.mockReturnValue(v.promise);
    patchVisibility.mockReturnValue(s.promise);

    act(() => {
      api.saveValue("new value");
      api.saveVisibility("public");
    });

    await act(async () => {
      s.resolve(payload({ value: "old value", visibility: "public" }));
      await s.promise;
    });
    await act(async () => {
      v.reject(new Error("boom"));
      await v.promise.catch(() => {});
    });

    await waitFor(() => expect(api.valueState().isError).toBe(true));
    expect(cachedField().visibility).toBe("public");
    expect(cachedField().value).toBe("old value");
  });

  it("BOTH fail — the cache is not touched at all", async () => {
    const v = deferred<ProfileField>();
    const s = deferred<ProfileField>();
    patchValue.mockReturnValue(v.promise);
    patchVisibility.mockReturnValue(s.promise);

    act(() => {
      api.saveValue("new value");
      api.saveVisibility("public");
    });
    await act(async () => {
      v.reject(new Error("boom"));
      s.reject(new Error("boom"));
      await Promise.allSettled([v.promise, s.promise]);
    });

    await waitFor(() => {
      expect(api.valueState().isError).toBe(true);
      expect(api.visibilityState().isError).toBe(true);
    });
    expect(cachedField().value).toBe("old value");
    expect(cachedField().visibility).toBe("private");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Retrying only the failed half
// ─────────────────────────────────────────────────────────────────────────

describe("retry of the failed half only", () => {
  it("does not disturb the half that already succeeded", async () => {
    const v1 = deferred<ProfileField>();
    const s1 = deferred<ProfileField>();
    patchValue.mockReturnValue(v1.promise);
    patchVisibility.mockReturnValue(s1.promise);

    act(() => {
      api.saveValue("new value");
      api.saveVisibility("public");
    });
    await act(async () => {
      v1.resolve(payload({ value: "new value", visibility: "private" }));
      s1.reject(new Error("boom"));
      await Promise.allSettled([v1.promise, s1.promise]);
    });
    await waitFor(() => expect(api.visibilityState().isError).toBe(true));
    expect(cachedField().value).toBe("new value");

    // Retry ONLY visibility. Its response still carries a stale `value` —
    // the field was reloaded before... whatever; the point is the merge must
    // ignore it.
    const s2 = deferred<ProfileField>();
    patchVisibility.mockReturnValue(s2.promise);
    act(() => api.saveVisibility("public"));
    await act(async () => {
      s2.resolve(payload({ value: "old value", visibility: "public" }));
      await s2.promise;
    });

    await waitFor(() => expect(api.visibilityState().isSuccess).toBe(true));
    expect(cachedField().visibility).toBe("public");
    // THE regression: the retry's stale `value` must not undo the earlier
    // successful value save.
    expect(cachedField().value).toBe("new value");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Mutation control — prove these tests can fail
// ─────────────────────────────────────────────────────────────────────────

describe("mutation control", () => {
  it("a whole-object merge WOULD clobber, which is what the fix removed", async () => {
    // Reproduces the old `f.key === updated.key ? updated : f` merge against
    // the same payloads, so the scenario above is shown to be a real
    // interleaving rather than an imagined one. If this ever stops
    // clobbering, the tests above are no longer proving anything.
    let state = SEED;
    const wholeObjectMerge = (updated: ProfileField) => {
      state = { ...state, fields: state.fields.map((f) => (f.key === updated.key ? updated : f)) };
    };
    wholeObjectMerge(payload({ value: "old value", visibility: "public" })); // visibility resp.
    wholeObjectMerge(payload({ value: "new value", visibility: "private" })); // value resp., last
    expect(state.fields[0]?.value).toBe("new value");
    expect(state.fields[0]?.visibility).toBe("private"); // ← the lost change
  });
});
