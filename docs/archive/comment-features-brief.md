> **ARCHIVED 2026-07-19 — completed plan.** All three features shipped: comment media attach (contract v1.41; media-only comments v1.44), threaded replies (v1.42), comment sort (v1.40). Note: the "Top" sort shipped as **most-stoked**, not this brief's recommended reply_count signal. Do not read as current guidance — the umbrella docs/api-contract-v1.md is authoritative.

# Decision brief — comment attachments, threaded replies, and "Top" sort

**Status:** frontend composer redesign shipped (glassy sticky grow-with-text box,
everything-inside, themed off cardstock). **These three features are blocked on
bcc-trust / bcc-core** — the comment view-model is flat, text-only, and unsorted
today, so none can be persisted frontend-only. This brief scopes the backend work
so each can move as one changeset (PHP builder → umbrella `api-contract-v1.md` →
frontend `types.ts` → hook), per doctrine §2.

Current shape (frontend `src/lib/api/types.ts`):
- `Comment` = `{ id, comment_id, feed_id, author, body, mentions[], posted_at, permissions:{can_delete} }` — **no parent id, no media, no score.**
- `CreateCommentRequest` = `{ feed_id, body }` — **body only.**
- `GET /posts/:feed_id/comments` = cursor + limit — **no sort param.**
- Doc note on the type: *"V1 is flat: top-level only… replies-in-replies via @-mentions in body."*

---

## 1. Gif / image attach on a comment

**Goal:** let a comment carry one image or gif, like the post composer does.

### bcc-trust / bcc-core
1. **Upload path.** Reuse the existing attachment pattern — the blog composer already
   does `POST /bcc/v1/blog/cover-image` (multipart → `{attachment_id, url, width, height}`,
   see `BlogCoverImageUploadResponse`). Add the equivalent for comments, or a shared
   `POST /bcc/v1/media` that returns the same shape and verifies the uploader owns the
   attachment before it's referenced.
2. **Accept on create.** Extend the create-comment request to accept an optional
   `attachment_id` (verify ownership, same as blog cover). Gifs from Giphy are already
   remote URLs elsewhere in the app — decide whether a comment gif is (a) an uploaded
   attachment or (b) a stored remote `gif_url` + `gif_mp4_url` (mirror the post gif
   contract so the frontend can reuse the play/pause treatment).
3. **Emit on read.** Add an optional `media` block to the `Comment` view-model, e.g.
   `media?: { kind: "photo" | "gif", url, mp4_url?, width, height }`. Absent → text-only
   comment (all existing comments).

### bcc-frontend (I'll handle)
- Add an attach button inside the composer box (the layout already reserves the footer
  row); on pick, upload → hold `attachment_id` → send with the comment; render
  `comment.media` above the body in `CommentRow`, reusing the feed `Lightbox` for
  full-size and the existing gif play/pause treatment.

---

## 2. Threaded / nested replies

**Goal:** replies nest under their parent instead of the current flat @-mention model.

### Design recommendation (indent depth)
Reddit-style: store true parent→child links (unbounded depth), but **cap visual indent
at ~3 levels**; deeper chains flatten under a "continue this thread →" affordance that
links to that subtree. This keeps deep threads readable on narrow columns without losing
data. Tia left depth to us; this is the recommended default.

### bcc-trust / bcc-core
1. **Model.** Add a nullable `parent_comment_id` to the comment row (self-referential FK,
   indexed). Null = top-level.
2. **Accept on create.** `CreateCommentRequest` gains optional `parent_id`. Validate it
   belongs to the same `feed_id` and isn't itself deleted.
3. **Emit on read.** Add `parent_id: string | null` and a `reply_count: number` to the
   `Comment` view-model. Keep the list endpoint returning a **flat, cursor-paginated
   array** (do NOT pre-nest server-side) — the frontend assembles the tree from
   `parent_id`. This preserves the existing pagination contract; only two fields are added.
   - Decide the ordering guarantee: siblings by `posted_at ASC`, and confirm a child can
     page in on a later cursor than its parent (frontend handles out-of-order arrival by
     buffering orphans until the parent loads).
4. **Depth/limit.** If unbounded depth is undesirable server-side, cap stored depth (e.g.
   8) and reject deeper replies with a typed error.

### bcc-frontend (I'll handle)
- Build the tree from the flat `parent_id` list, render with capped indent + "continue
  this thread", add a "Reply" action per row that seeds the sticky composer with `parent_id`
  (and a visible "replying to @handle" chip that clears on cancel).

---

## 3. "Top" comment sort

**Goal:** the filter row (already shipped, "Top" is disabled) needs a real Top order.

**Blocker:** a comment has no score to sort by. Top requires *some* signal.
Options, cheapest first:
- **A — reply_count (free if §2 ships).** "Top" = most-replied. No new signal, reuses the
  threading count. Weakest as a quality signal but zero extra cost.
- **B — comment reactions.** Add a lightweight like/upvote on comments (new table + count
  on the view-model). Truest "Top", biggest lift; only worth it if comment reactions are
  wanted for their own sake.

### bcc-trust / bcc-core
- Add a `sort` query param to `GET /posts/:feed_id/comments` (`newest` default | `top`).
  For `top`, order by the chosen signal then `posted_at`. Keep cursor pagination stable
  under each sort (encode the sort into the cursor).

### bcc-frontend (I'll handle)
- Wire the filter row's "Top" pill to pass `sort` into `useComments` (new query-key
  dimension so Newest/Top cache separately), and enable the pill once the param lands.

**Recommendation:** fold Top into the §2 threading changeset using **option A
(reply_count)** — it's nearly free once `reply_count` exists — and defer comment
reactions (option B) unless they're independently desired.

---

## Sequencing

Each of the three is independent and can ship on its own timeline. Suggested order by
value/effort: **(1) attach** and **(2) threading** are the high-value items; **(3) Top**
rides on threading's `reply_count`. Frontend is ready to consume each the moment its
fields land — version bump + PR to Tia per the plugin branch/versioning rules, not
direct-to-main.
