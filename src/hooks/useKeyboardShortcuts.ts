"use client";

/**
 * useKeyboardShortcuts — declarative single-key shortcut binding.
 *
 * Subscribes a window-scoped `keydown` listener while `enabled` is
 * true; cleans up on unmount or when `enabled` flips false. Matches
 * shortcuts on `event.key` (or `event.code` for layout-independent
 * keys like `Slash`).
 *
 * Why this hook exists:
 *   §11 duplicate scan found ten ad-hoc `addEventListener("keydown", …)`
 *   call sites across the SPA (GlobalSearch, MentionPopover, modals,
 *   ViewerMenu, etc.). Each handles Escape + arrow keys inline. This
 *   hook is the eleventh case waiting to happen — extracted now so
 *   any future shortcut surface (admin queue, panel duty, …) plugs in
 *   instead of forking another inline listener.
 *
 * Design:
 *   - Shortcuts are an array of `{ key, run, when? }`. The first
 *     match wins (so put more-specific shortcuts before less-specific
 *     ones if there's overlap).
 *   - When the user is typing in an input/textarea/contenteditable,
 *     letter shortcuts (a–z) are suppressed. Modifier-key combos
 *     (Cmd/Ctrl/Meta) and non-letter keys (`/`, `?`, Escape) still
 *     fire — that's the established cross-app convention.
 *   - The `when` predicate is evaluated per event so a single shortcut
 *     can be conditionally active without re-binding the listener.
 *
 * Doesn't:
 *   - Support chord shortcuts (Cmd+K, etc.) — out of scope until a
 *     real consumer needs it.
 *   - Render a UI overlay — that's the consumer's job.
 *   - Trap focus or scope to a region — listener is window-level.
 */

import { useEffect, useRef } from "react";

export interface KeyboardShortcut {
  /**
   * Either a `KeyboardEvent.key` value (e.g. "h", "Escape", "?") or
   * a `KeyboardEvent.code` value prefixed with `code:` (e.g. "code:Slash"
   * to match the physical `/` key regardless of keyboard layout).
   */
  key: string;
  /** Called when the key matches and `when()` (if provided) returns true. */
  run: (event: KeyboardEvent) => void;
  /** Optional predicate evaluated per event. */
  when?: (event: KeyboardEvent) => boolean;
  /** Description for the `?` overlay. Optional. */
  description?: string;
  /** Display label for the `?` overlay. Defaults to `key`. */
  label?: string;
}

/**
 * Returns true when the focused element is one where letter
 * shortcuts would interfere with typing.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function matches(event: KeyboardEvent, key: string): boolean {
  if (key.startsWith("code:")) {
    return event.code === key.slice(5);
  }
  // Case-insensitive match for letter keys; exact match for everything
  // else (Escape, ?, /, ArrowDown, etc.).
  if (key.length === 1 && /[a-z]/i.test(key)) {
    return event.key.toLowerCase() === key.toLowerCase();
  }
  return event.key === key;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true,
): void {
  // Latest-ref pattern: callers pass a fresh `shortcuts` array each
  // render (declarative API) but the window listener should be bound
  // ONCE per `enabled` toggle, not on every render. We keep the array
  // in a ref that's updated synchronously after each render and read
  // through it from the stable handler below.
  const shortcutsRef = useRef<KeyboardShortcut[]>(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);

      for (const shortcut of shortcutsRef.current) {
        if (!matches(event, shortcut.key)) continue;
        if (shortcut.when && !shortcut.when(event)) continue;

        // Suppress letter keys while typing; allow `?`, `/`, Escape,
        // arrows, modifier combos, etc.
        const isPlainLetter =
          shortcut.key.length === 1 &&
          /[a-z]/i.test(shortcut.key) &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey;
        if (typing && isPlainLetter) continue;

        shortcut.run(event);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
