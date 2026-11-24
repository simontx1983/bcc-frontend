"use client";

/**
 * AdminUserPicker — search for a member and pick one, for the owner link
 * form. Backed by the ADMIN user search (route 8) through
 * useAdminUserSearch: debounced, at most 10 results, matching handle or
 * display name, or an exact email or login.
 *
 * Results show avatar, display name and @handle (AdminUserChip). Never an
 * email or login: the route never returns either. A search route the
 * server doesn't have yet (`rest_no_route`) says so instead of "try again".
 *
 * The ARIA combobox idiom of MentionPopover / GlobalSearch: the input
 * keeps focus and carries role="combobox", aria-expanded, aria-controls
 * and aria-activedescendant; ↓/↑ move, Enter picks, Esc closes the list.
 * Options keep focus on the input (mousedown is prevented), so a click
 * picks without blurring the field first. Picking swaps the search box
 * for the chosen member, so focus moves to its "Change" button; "Change"
 * hands focus back to the search box.
 */

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { ADMIN_TOOL_UNAVAILABLE_COPY } from "@/components/admin/validators/AdminReadFailure";
import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import { ADMIN_GHOST_BUTTON_CLASS, ADMIN_INPUT_CLASS } from "@/components/admin/validators/form-classes";
import { useAdminUserSearch } from "@/hooks/useAdminValidators";
import { isAdminToolUnavailable } from "@/lib/api/admin-errors";
import type { AdminUserRef } from "@/lib/api/types";

export interface AdminUserPickerProps {
  /** The input's id, for the caller's <label htmlFor>. */
  id: string;
  /** The caller's label element id: names the picked member's group once the input is gone. */
  labelId: string;
  value: AdminUserRef | null;
  onChange: (user: AdminUserRef | null) => void;
  describedBy?: string | undefined;
  invalid?: boolean;
  /** The search box, for the caller to focus (e.g. on a field error). */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** The "Change" button shown once a member is picked. */
  changeRef?: RefObject<HTMLButtonElement | null>;
}

export function AdminUserPicker({
  id,
  labelId,
  value,
  onChange,
  describedBy,
  invalid = false,
  inputRef,
  changeRef,
}: AdminUserPickerProps) {
  const [query, setQuery] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const ownInputRef = useRef<HTMLInputElement>(null);
  const ownChangeRef = useRef<HTMLButtonElement>(null);
  const searchBox = inputRef ?? ownInputRef;
  const changeButton = changeRef ?? ownChangeRef;
  // Where focus goes once the swap between search box and chip renders.
  const focusAfterSwap = useRef<"change" | "search" | null>(null);

  const search = useAdminUserSearch(value === null ? query : "");
  const items = search.data ?? [];
  const open = value === null && query.trim() !== "" && !dismissed;

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length, query]);

  useEffect(() => {
    const target = focusAfterSwap.current;
    focusAfterSwap.current = null;
    if (target === "change") changeButton.current?.focus();
    else if (target === "search") searchBox.current?.focus();
  }, [value, changeButton, searchBox]);

  if (value !== null) {
    return (
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-bcc-border px-3 py-2"
      >
        <AdminUserChip user={value} />
        <button
          ref={changeButton}
          type="button"
          onClick={() => {
            focusAfterSwap.current = "search";
            onChange(null);
            setQuery("");
          }}
          aria-label={`Change member (now @${value.handle})`}
          className={ADMIN_GHOST_BUTTON_CLASS}
        >
          Change
        </button>
      </div>
    );
  }

  const pick = (user: AdminUserRef) => {
    focusAfterSwap.current = "change";
    onChange(user);
    setQuery("");
    setDismissed(false);
  };

  const active = open ? items[activeIndex] : undefined;

  return (
    <div
      className="flex flex-col gap-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDismissed(true);
      }}
    >
      <input
        ref={searchBox}
        id={id}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={active !== undefined ? `${listboxId}-opt-${active.user_id}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setDismissed(false);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown" && items.length > 0) {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % items.length);
          } else if (e.key === "ArrowUp" && items.length > 0) {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === "Enter") {
            // Never submit the surrounding form from the search box.
            e.preventDefault();
            if (active !== undefined) pick(active);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
          }
        }}
        placeholder="Search by handle, name, or exact email"
        className={ADMIN_INPUT_CLASS}
      />

      <div
        role="listbox"
        id={listboxId}
        aria-label="Members"
        hidden={!open}
        className="flex flex-col rounded-sm border border-bcc-border bg-bcc-surface-raised"
      >
        {open &&
          (search.isError ? (
            <p className="bcc-mono px-3 py-3 text-[11px] text-bcc-text-error">
              {isAdminToolUnavailable(search.error)
                ? ADMIN_TOOL_UNAVAILABLE_COPY
                : "Couldn't search members. Try again."}
            </p>
          ) : search.data === undefined ? (
            <p className="bcc-mono px-3 py-3 text-[11px] text-bcc-text-secondary">Searching…</p>
          ) : items.length === 0 ? (
            <p className="bcc-mono px-3 py-3 text-[11px] text-bcc-text-secondary">
              No members match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            items.map((user, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={user.user_id}
                  id={`${listboxId}-opt-${user.user_id}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={isActive}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(user)}
                  className={
                    "flex min-h-[44px] items-center px-3 py-2 text-left " +
                    (isActive ? "bg-bcc-surface-active" : "hover:bg-bcc-surface-hover")
                  }
                >
                  <AdminUserChip user={user} size="xs" />
                </button>
              );
            })
          ))}
      </div>
    </div>
  );
}
