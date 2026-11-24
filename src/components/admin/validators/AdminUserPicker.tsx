"use client";

/**
 * AdminUserPicker — the owner link form's member picker: UserSearchPicker
 * over the ADMIN user search (route 8) through useAdminUserSearch —
 * debounced, at most 10 results, matching handle or display name, or an
 * exact email or login.
 */

import { useState } from "react";

import { UserSearchPicker, type UserPickerProps } from "@/components/admin/validators/UserSearchPicker";
import { useAdminUserSearch } from "@/hooks/useAdminValidators";

export function AdminUserPicker(props: UserPickerProps) {
  const [query, setQuery] = useState("");
  const search = useAdminUserSearch(props.value === null ? query : "");
  return (
    <UserSearchPicker
      {...props}
      query={query}
      onQueryChange={setQuery}
      results={search}
      placeholder="Search by handle, name, or exact email"
    />
  );
}
