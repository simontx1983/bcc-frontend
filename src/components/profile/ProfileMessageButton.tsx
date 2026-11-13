"use client";

/**
 * ProfileMessageButton — the Message entry point on the redesigned public
 * profile. It used to live on the member card's action bar, which the
 * Handoff v1 trust header replaced; this mounts the SAME MessagePill
 * (cards/CardActionBar) so the gating stays in one place: server
 * `can_message` decides allowed / disabled-with-hint / hidden. A locked
 * tap shows the server's reason inline (the card used a toast for this).
 */

import { useState } from "react";

import { MessagePill } from "@/components/cards/CardActionBar";

export function ProfileMessageButton({
  permissions,
  recipientId,
  recipientName,
}: {
  permissions: unknown;
  recipientId: number;
  recipientName: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <MessagePill
        permissions={permissions}
        recipientId={recipientId}
        recipientName={recipientName}
        onLocked={setReason}
      />
      {reason !== null && (
        <p role="status" className="bcc-mono text-[11px] text-bcc-text-secondary">
          {reason}
        </p>
      )}
    </div>
  );
}
