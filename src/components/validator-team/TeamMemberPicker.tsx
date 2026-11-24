"use client";

/**
 * TeamMemberPicker — the invite form's member picker: UserSearchPicker
 * over the existing mention search (useMentionSearch → GET
 * /users/mention-search), which already applies the platform's privacy
 * filters. The results are advisory: the server re-checks the invitee
 * and refuses with one generic `invite_not_possible`.
 */

import { useState } from "react";

import { UserSearchPicker, type UserPickerProps } from "@/components/admin/validators/UserSearchPicker";
import { useMentionSearch } from "@/hooks/useMentionSearch";

export function TeamMemberPicker(props: UserPickerProps) {
  const [query, setQuery] = useState("");
  const search = useMentionSearch({ query, enabled: props.value === null });
  return (
    <UserSearchPicker
      {...props}
      query={query}
      onQueryChange={setQuery}
      results={search}
      placeholder="Search by handle or name"
    />
  );
}
