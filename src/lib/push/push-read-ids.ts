/**
 * F-516: opening a push marks the bell rows it stood for as read.
 *
 * The service worker holds no credentials (the bearer lives in the page),
 * so it hands the push's `notification_ids` to the page: as this query
 * param on a tab it opens, or as this message to a tab already on the
 * push's URL. The page then calls mark-read with exactly those ids.
 * Keep the names in step with public/sw.js.
 */
export const PUSH_READ_PARAM = "bcc_read";

export const PUSH_READ_MESSAGE = "bcc:mark-read";

/** As many ids as one mark-read call takes (contract §4.10). */
export const PUSH_READ_MAX_IDS = 50;

/**
 * 1 to PUSH_READ_MAX_IDS positive integer ids, de-duplicated in order, from
 * a list (a message) or a comma-separated string (the query param). Null
 * for anything else: the caller then marks nothing, never "all".
 */
export function parsePushReadIds(raw: unknown): number[] | null {
  const list: unknown = typeof raw === "string" ? raw.split(",") : raw;
  if (!Array.isArray(list) || list.length === 0 || list.length > PUSH_READ_MAX_IDS) {
    return null;
  }
  const ids = new Set<number>();
  for (const value of list) {
    let id = Number.NaN;
    if (typeof value === "number") {
      id = value;
    } else if (typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value)) {
      id = Number(value);
    }
    if (!Number.isSafeInteger(id) || id <= 0) {
      return null;
    }
    ids.add(id);
  }
  return [...ids];
}
