export const UPLOAD_RIGHTS_REMINDER =
  "Only upload images you created or have permission to share.";

export function UploadRightsReminder() {
  return (
    <p className="bcc-mono text-[11px] text-bcc-text-secondary">
      {UPLOAD_RIGHTS_REMINDER}
    </p>
  );
}
