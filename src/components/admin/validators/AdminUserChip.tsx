/**
 * AdminUserChip — avatar, display name and @handle for a validator admin
 * user reference. Plain text: no profile link, no hovercard, no rank chip
 * (the admin user object carries no tier, and this is staff tooling).
 */

import { Avatar } from "@/components/identity/Avatar";
import type { AdminUserRef } from "@/lib/api/types";

export interface AdminUserChipProps {
  user: AdminUserRef;
  size?: "xs" | "sm";
}

export function AdminUserChip({ user, size = "sm" }: AdminUserChipProps) {
  const hasName = user.display_name.trim() !== "";
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar
        avatarUrl={user.avatar_url}
        handle={user.handle}
        displayName={user.display_name}
        size={size}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-serif text-sm text-bcc-text">
          {hasName ? user.display_name : `@${user.handle}`}
        </span>
        {hasName && (
          <span className="bcc-mono truncate text-[10px] text-bcc-text-secondary">
            @{user.handle}
          </span>
        )}
      </span>
    </span>
  );
}
