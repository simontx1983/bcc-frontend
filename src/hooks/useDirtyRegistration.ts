"use client";

/**
 * useDirtyRegistration — a settings form tells the provider whether it has
 * unsaved work and whether a save is in flight.
 *
 * The form owns its draft and its saved baseline; this only reports two
 * booleans and a human label. Nothing here ever receives a field value, an
 * email, or a password — the provider must not become a place where a
 * credential can be read out of React state.
 *
 * Registration is removed on unmount, which is how a discarded panel's
 * entries disappear: the provider never resets a form, it just stops hearing
 * from one that no longer exists.
 *
 * Outside a provider the hook is inert, so a form can be rendered standalone
 * in a test without dragging the whole settings shell along.
 */

import { useEffect } from "react";

import { useDirtyRegistry } from "@/components/settings/SettingsDirtyProvider";

export interface DirtyRegistrationOptions {
  /** Stable and unique, e.g. "account.email" or `profile.field.${key}`. */
  id: string;
  /**
   * Human phrase naming what is unsaved, used in the dialog body:
   * "You have unsaved changes to <label>." Keep it a noun phrase.
   */
  label: string;
  isDirty: boolean;
  /** True while this surface's own mutation is in flight. */
  isSaving: boolean;
}

export function useDirtyRegistration({
  id,
  label,
  isDirty,
  isSaving,
}: DirtyRegistrationOptions): void {
  const registry = useDirtyRegistry();

  useEffect(() => {
    if (registry === null) return;
    registry.register(id, { label, isDirty, isSaving });
  }, [registry, id, label, isDirty, isSaving]);

  // Separate effect keyed only on identity: the cleanup above would otherwise
  // fire on every isDirty flip and briefly deregister a still-mounted form.
  useEffect(() => {
    if (registry === null) return;
    return () => registry.unregister(id);
  }, [registry, id]);
}
