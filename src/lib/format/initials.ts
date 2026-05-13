/**
 * deriveInitials — shared 2-char monogram helper.
 *
 * Single source of truth for the avatar initials fallback used across
 * the app. Replaces three drift-prone duplicates that previously lived
 * in BinderTile, GroupMembersStrip, and NftPieceDetail.
 *
 * Rules (mechanical — no business logic):
 *   - Prefer `displayName` when non-empty; otherwise fall back to
 *     `handle` (with any leading `@` stripped).
 *   - Split on whitespace OR hyphen — handles both "Phillip Walker"
 *     (display name) and "blue-collar-bot" (handle) cleanly.
 *   - Two-or-more tokens → first char of first two tokens.
 *   - One token → first two chars of that token.
 *   - One-char token → that single char (no padding — caller can
 *     decide whether to render a single letter or a placeholder).
 *   - Both inputs empty → "" (component branches on empty, not us).
 *
 * Output is always uppercase ASCII when input is ASCII; for non-ASCII
 * (e.g., emoji handles, Cyrillic display names) we still uppercase via
 * String.prototype.toUpperCase so Latin-mixed inputs render correctly.
 */
export function deriveInitials(
  displayName: string | null | undefined,
  handle: string,
): string {
  const fromDisplay =
    typeof displayName === "string" ? displayName.trim() : "";
  // Strip a leading "@" — handles may arrive with or without it
  // depending on the call site.
  const fromHandle = handle.replace(/^@/, "").trim();

  const source = fromDisplay !== "" ? fromDisplay : fromHandle;
  if (source === "") return "";

  const tokens = source.split(/[\s-]+/).filter((t) => t !== "");
  if (tokens.length === 0) return "";

  if (tokens.length >= 2) {
    const first = tokens[0] ?? "";
    const second = tokens[1] ?? "";
    const a = first.charAt(0);
    const b = second.charAt(0);
    return (a + b).toUpperCase();
  }

  // Single token — take up to two chars.
  const only = tokens[0] ?? "";
  return only.slice(0, 2).toUpperCase();
}
