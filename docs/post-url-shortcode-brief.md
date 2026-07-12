# Decision brief — scalable post URLs (`/u/{handle}/post/{shortcode}`)

**Status:** route shape decided; **encoding is the open decision (Tia + Phillip).**
Ship with **V1 (Hashids)** now; **Stored `short_id`** is the documented upgrade.

---

## Why

Today a post permalink is `/post/{numeric_feed_id}` (e.g. `/post/118`). Two problems:
- **Unprofessional / leaky** — the raw sequential id tells everyone "this is post #118."
- **Not scalable-feeling** — `/post/124567897` as the site grows.

Target: **`/u/{handle}/post/{shortcode}`** — e.g. `/u/oakteller/post/k3Rf9`.
Nested under the existing `/u/{handle}` namespace, so there is **no root-route
collision risk** (a bare root `/{handle}/...` would shadow `/p`, `/c`,
`/communities`, etc.). The shortcode is the canonical resolver; the handle is
display context (redirect to canonical handle if it drifts after a rename).

---

## The open decision: how to encode `{shortcode}`

| | **V1 — Hashids** (recommended to start) | **Target — Stored `short_id`** |
|---|---|---|
| What | Reversibly encode the existing feed id with a salt → `k3Rf9` | Random base62 column (e.g. 8 chars), unique-indexed, generated at post-create |
| DB work | **None** | Migration + backfill all existing posts + unique index |
| Opacity | Hides the number; decodable if the salt leaks (low risk) | Fully opaque, zero order leakage |
| Ships | Immediately | After migration |

**Upgrade path (why V1 is not a trap):** when you move to `short_id`, add the
column + backfill, start emitting `short_id` in new URLs, and keep the Hashids
**decoder** alive as a fallback resolver (old links still work) or 301-redirect
decoded Hashids → the new canonical `short_id` URL. Starting on Hashids costs
nothing later; it only defers the migration.

**Recommendation:** ship **Hashids** now, revisit `short_id` if/when opacity
requirements harden.

---

## Implementation guide

### bcc-trust (backend) — Phillip's Claude

1. **Hashids helper.** Add a small `PostShortcode` service: `encode(int $feedId): string`
   and `decode(string $code): ?int`, salted from a config constant. If the
   `hashids/hashids` composer package isn't present, either add it (then
   `composer dump-autoload --no-dev -o` before committing `vendor/`) or hand-roll
   a reversible base62-with-salt encoder — keep it in ONE service so V2 can swap
   the internals.
2. **Emit the new link.** Find where the feed item view-model sets
   `links.self` (grep the feed item assembler — the codebase builds links as
   `['self' => '/prefix/' . $id]`, e.g. `GroupsService`, `LocalsService`; the
   feed item's link is assembled alongside `post_kind` / `author` / `reactions`).
   Change it to:
   `'self' => '/u/' . $authorHandle . '/post/' . PostShortcode::encode($feedId)`.
   Both the list feed and the single-item `GET /feed/{id}` view-model must emit
   the same shape.
3. **Resolve the shortcode.** `GET /feed/{id}` currently takes the numeric id.
   Accept the shortcode: `PostShortcode::decode($param)` → numeric id → existing
   lookup. Keep numeric ids working (decode returns null for a numeric string →
   fall back to `(int)`), so old `/post/{id}` links + shares still resolve.
4. **Contract.** Update the umbrella `api-contract-v1.md` §F to document
   `links.self` = `/u/{handle}/post/{shortcode}` and that `GET /feed/{idOrShortcode}`
   accepts either.
5. **Version bump** before pushing (per repo rule), PR to Tia (not direct-to-main).

### bcc-frontend — I'll handle this side

- Add route `app/(main)/u/[handle]/post/[shortcode]/page.tsx` (+ its `opengraph-image`
  / `twitter-image`) — same body as today's `post/[id]/page.tsx`, param renamed;
  `getFeedItemById(shortcode, …)` (backend decodes).
- `item.links.self` is already consumed generically (`FeedItemCard`, `ShareButton`,
  `PostRailRegistrar`, etc.), so **click-through + OG + share need no changes** once
  the backend emits the new string.
- Keep `app/(main)/post/[id]/page.tsx` as a **308 redirect** to the canonical
  `links.self` (fetch item → `redirect(item.links.self)`) so every existing
  shared `/post/{id}` link survives.
- If the URL handle ≠ the post's current author handle (post-rename), 308 to the
  canonical handle.

### Sequencing

Backend must emit the new `links.self` **before** the frontend route flips, or
click-throughs 404. So: bcc-trust PR merges → frontend route + redirect ships.
Until then, `/post/{id}` keeps working unchanged.
