"use client";

/**
 * Settings dirty-state guard — stops a sub-tab switch from silently
 * destroying unsaved edits in the My Profile panels.
 *
 * ## Why this exists
 *
 * The panels are conditionally rendered, so selecting another sub-tab
 * unmounts the current one and React discards its local draft with no
 * warning. Grouping eight owner sections behind one parent tab put that a
 * single click away.
 *
 * ## Why the guard is one callback and not route interception
 *
 * `ProfileTabs.handleTabChange` is a single choke point: it holds BOTH the
 * unmount (`setActive`) and the URL write (`history.replaceState`), and every
 * activation path runs through it — the parent strip's buttons, the sub
 * strip's `onSelect`, and `useRovingTabs`' Enter/Space. So protecting sub-tab
 * navigation means guarding one function. No history patching and no global
 * click capture, neither of which App Router supports reliably anyway.
 *
 * ## What this deliberately CANNOT do
 *
 * It owns no draft. Each form owns its fields and its saved baseline, so the
 * guard is TOLD whether a form is dirty; it never decides. There is therefore
 * no `clearAll()`: marking the registry clean while the inputs still held
 * modified values would be a lie, and the forms would re-report dirty on
 * their next render anyway. "Discard" instead authorises exactly one
 * guard-bypassing navigation and lets ordinary unmount cleanup drop the
 * entries.
 *
 * Registry values are booleans and labels ONLY — no field value, email or
 * password is ever stored here.
 *
 * ## Saving beats dirty
 *
 * Once a mutation is in flight we cannot promise the server will ignore it,
 * so "Discard" would be a false promise. While anything is saving the user
 * gets a wait dialog with no Discard, one queued destination, and a
 * resolution when the save settles.
 *
 * ## Shape
 *
 * The registry state and the guard must live in the same component, and that
 * component also renders the strips. So this exposes a hook rather than a
 * wrapper component — `ProfileTabs` calls `useSettingsDirtyGuard`, spreads the
 * provider around its panels, and renders the returned dialog. That keeps the
 * call site to three lines instead of splitting a 700-line component in two.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { UnsavedChangesDialog } from "@/components/settings/UnsavedChangesDialog";

/** One registered surface. Booleans and a label — never a value. */
export interface DirtyEntry {
  label: string;
  isDirty: boolean;
  isSaving: boolean;
}

export interface DirtyRegistry {
  register: (id: string, entry: DirtyEntry) => void;
  unregister: (id: string) => void;
}

const RegistryContext = createContext<DirtyRegistry | null>(null);

/**
 * Internal — used by `useDirtyRegistration`. Returns null outside a provider
 * so a form rendered standalone (tests) is inert rather than throwing.
 */
export function useDirtyRegistry(): DirtyRegistry | null {
  return useContext(RegistryContext);
}

export function SettingsDirtyProvider({
  registry,
  children,
}: {
  registry: DirtyRegistry;
  children: ReactNode;
}) {
  return (
    <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>
  );
}

type DialogMode = "none" | "decision" | "waiting";

export interface SettingsDirtyGuard<K extends string = string> {
  /** Pass to `SettingsDirtyProvider`. */
  registry: DirtyRegistry;
  /** The guarded navigation entry point. Both tab strips call ONLY this. */
  requestNavigation: (key: K) => void;
  /** Render inside the provider. `null` when no dialog is open. */
  dialog: ReactNode;
  /** Exposed for tests and assertions. */
  anyDirty: boolean;
  anySaving: boolean;
}

export function useSettingsDirtyGuard<K extends string = string>(
  /** The raw, UNGUARDED tab change. Only this hook may call it. */
  navigate: (key: K) => void,
): SettingsDirtyGuard<K> {
  // A ref holds the entries (mutated from children's effects) and a counter
  // drives re-render, so registering during a child's effect phase cannot
  // tear the parent's state.
  const entriesRef = useRef<Map<string, DirtyEntry>>(new Map());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const register = useCallback(
    (id: string, entry: DirtyEntry) => {
      const prev = entriesRef.current.get(id);
      if (
        prev !== undefined &&
        prev.isDirty === entry.isDirty &&
        prev.isSaving === entry.isSaving &&
        prev.label === entry.label
      ) {
        return; // nothing observable changed — don't re-render
      }
      entriesRef.current.set(id, entry);
      bump();
    },
    [bump],
  );

  const unregister = useCallback(
    (id: string) => {
      if (entriesRef.current.delete(id)) bump();
    },
    [bump],
  );

  const registry = useMemo<DirtyRegistry>(
    () => ({ register, unregister }),
    [register, unregister],
  );

  const { anyDirty, anySaving, dirtyLabels } = useMemo(() => {
    let dirty = false;
    let saving = false;
    const labels: string[] = [];
    for (const entry of entriesRef.current.values()) {
      if (entry.isSaving) saving = true;
      if (entry.isDirty) {
        dirty = true;
        if (!labels.includes(entry.label)) labels.push(entry.label);
      }
    }
    return { anyDirty: dirty, anySaving: saving, dirtyLabels: labels };
    // `version` is the dependency — the Map is mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const [mode, setMode] = useState<DialogMode>("none");
  const pendingKeyRef = useRef<K | null>(null);
  // One-shot permission to skip the guard. Set and consumed in the same
  // synchronous tick, so no later navigation can inherit it.
  const bypassRef = useRef(false);

  const closeDialog = useCallback(() => {
    setMode("none");
    pendingKeyRef.current = null;
  }, []);

  const requestNavigation = useCallback(
    (key: K) => {
      if (bypassRef.current) {
        bypassRef.current = false;
        navigate(key);
        return;
      }
      if (anySaving) {
        // Queue at most one destination — repeated clicks must not stack.
        if (pendingKeyRef.current === null) pendingKeyRef.current = key;
        setMode("waiting");
        return;
      }
      if (anyDirty) {
        if (pendingKeyRef.current === null) pendingKeyRef.current = key;
        setMode("decision");
        return;
      }
      navigate(key);
    },
    [anySaving, anyDirty, navigate],
  );

  const discardAndGo = useCallback(() => {
    const key = pendingKeyRef.current;
    if (key === null) return; // already consumed — cannot fire twice
    pendingKeyRef.current = null; // cleared BEFORE navigating
    setMode("none");
    bypassRef.current = true;
    requestNavigation(key); // consumes the bypass synchronously
  }, [requestNavigation]);

  // Resolve a queued navigation once in-flight saves settle. Success leaves
  // every form clean and we go; a failure leaves one dirty and the wait
  // becomes the ordinary decision.
  useEffect(() => {
    if (mode !== "waiting" || anySaving) return;
    if (pendingKeyRef.current === null) {
      setMode("none");
      return;
    }
    if (anyDirty) {
      setMode("decision");
      return;
    }
    const key = pendingKeyRef.current;
    pendingKeyRef.current = null;
    setMode("none");
    bypassRef.current = true;
    requestNavigation(key);
  }, [mode, anySaving, anyDirty, requestNavigation]);

  // Native guard for refresh / tab close. Active while anything is dirty OR
  // still saving — a request in flight is work the user can still lose.
  useEffect(() => {
    if (!anyDirty && !anySaving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need a truthy returnValue; the string is ignored.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty, anySaving]);

  const dialog =
    mode === "none" ? null : (
      <UnsavedChangesDialog
        mode={mode}
        labels={dirtyLabels}
        onKeepEditing={closeDialog}
        onDiscard={discardAndGo}
      />
    );

  return { registry, requestNavigation, dialog, anyDirty, anySaving };
}
