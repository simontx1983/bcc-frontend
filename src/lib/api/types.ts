/**
 * BCC API types — TypeScript counterparts of the bcc-trust REST contract.
 *
 * Single source of truth for the response envelope shape (§L5) plus
 * the per-endpoint payloads we already consume. New endpoints add
 * their payload type here as they land.
 *
 * Architectural rule: these types describe what the SERVER sends,
 * not what the UI wants. If a UI component needs a derived field,
 * we either ask the backend for it (correct path) or compute it in
 * a presentation hook (NEVER mutate trust_score / tier / rank locally).
 */

// ─────────────────────────────────────────────────────────────────────
// Envelope (§L5) — every BCC response has this shape.
// ─────────────────────────────────────────────────────────────────────

export interface ApiMeta {
  version: string;
  /** kind → resolved post.ID for §D5 reactions. Absent on error responses. */
  reaction_types?: Record<string, number>;
}

export interface ApiSuccess<T> {
  data: T;
  _meta: ApiMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    status: number;
  };
  _meta: ApiMeta;
}

/** Thrown by the client wrapper on any non-2xx envelope. */
export class BccApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly responseBody: ApiErrorBody | null;

  constructor(code: string, message: string, status: number, body: ApiErrorBody | null) {
    super(message);
    this.name = "BccApiError";
    this.code = code;
    this.status = status;
    this.responseBody = body;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Auth + onboarding (Phase 2)
// ─────────────────────────────────────────────────────────────────────

/**
 * Response shape for /auth/signup and /auth/login. Both endpoints
 * always carry the identifying fields; the `?` form previously here
 * was misleading — `authorize()` and `signup()` both treat them as
 * required and would throw on absence.
 *
 * If /auth/token (refresh) ever gets a frontend consumer, give it its
 * own type without `user_id` / `handle`.
 */
export interface AuthTokenResponse {
  user_id: number;
  handle: string;
  token: string;
  /** Seconds until exp from now. JwtToken::TTL_SECONDS = 604800 (7 days) for V1. */
  expires_in: number;
  token_type: "Bearer";
}

export interface HandleUpdateResponse {
  handle: string;
  /** ISO 8601 UTC. Null when the rename was a no-op (current === new). */
  next_change_at: string | null;
}

/**
 * §B4 wizard step 1 — the home-chain picker. Five at launch; the
 * server's allowlist is broader (mirrors LocalsService::CHAIN_KEYWORDS)
 * so a settings-page change can hand the user one of the wider set
 * without a backend revision.
 */
export type HomeChain =
  | "cosmos"
  | "osmosis"
  | "injective"
  | "ethereum"
  | "solana";

export interface OnboardingCompleteRequest {
  /** Omitted = wizard step 1 was skipped; server stores nothing. */
  home_chain?: HomeChain;
}

export interface OnboardingCompleteResponse {
  completed: true;
  /** Echoed back so the client can confirm what the server stored. */
  home_chain: HomeChain | null;
  /**
   * Pre-rendered rank label (§E2 — e.g. "Apprentice", "Journeyman"). Empty
   * string only if RankCatalog disagrees with RankService output, which
   * shouldn't happen in V1 — treat empty as "don't render the line."
   */
  rank_label: string;
}

export interface OnboardingStatus {
  onboarded: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Cards (§L5 polymorphic view-model)
// ─────────────────────────────────────────────────────────────────────

export type CardKind = "validator" | "project" | "creator" | "member";
export type ReputationTier = "elite" | "trusted" | "neutral" | "caution" | "risky";
export type CardTier = "legendary" | "rare" | "uncommon" | "common" | null;

export type CardStatFormat =
  | "score"
  | "percent"
  | "currency_usd"
  | "currency_native"
  | "count"
  | "duration"
  | "text";

export interface CardStat {
  key: string;
  label: string;
  /** Pre-formatted display string. Renderers MUST use this verbatim (§A2). */
  value: string;
  /**
   * Underlying numeric — present for `score`, `percent`, `currency_usd`,
   * `currency_native`, `count`, `duration`. Used for sparklines, charts,
   * and tooltip exact-value displays. Display path is always `value`.
   */
  raw?: number;
  format: CardStatFormat;
}

/**
 * §2.9 background_kind — the strategy the frontend uses to color the
 * crest. `chain` resolves a chain color token; `tier` resolves a tier
 * color token; `solid` is a literal hex string in `background_value`.
 *
 * V1 emits only `tier` (member + entity cards both use card_tier).
 * `chain` lights up alongside §K3 chain wiring in V1.5.
 */
export type CardCrestBackgroundKind = "chain" | "tier" | "solid";

export interface CardCrest {
  initials: string;
  monogram_color: string;
  background_kind: CardCrestBackgroundKind;
  /**
   * Slug or hex per `background_kind`:
   *   chain → chain slug ("cosmos", "osmosis", …)
   *   tier  → card_tier slug ("legendary", "rare", …)
   *   solid → "#rrggbb"
   */
  background_value: string;
  /**
   * Optional crest image (page avatar / member avatar). Null when no
   * avatar is set — the frontend falls back to the initials monogram
   * inside the hex. Page cards: PeepSoPagePhoto::get_page_avatar_url
   * first, then the post thumbnail. Member cards: get_avatar_url($userId).
   */
  image_url: string | null;
}

/**
 * Permission entry — the canonical {allowed, unlock_hint, reason_code}
 * shape returned by the server for every gated action. Consumers MUST
 * gate on `.allowed` — the entry itself is an object and is always
 * truthy in JS.
 */
export interface CardPermissionEntry {
  allowed: boolean;
  unlock_hint: string | null;
  reason_code: string | null;
}

export interface CardPermissions {
  can_review: CardPermissionEntry;
  can_dispute: CardPermissionEntry;
  can_pull: CardPermissionEntry;
  /** §V1.5 — endorse this entity (page-cards only; member cards always denied). */
  can_endorse: CardPermissionEntry;
  can_post_as_entity: boolean;
  can_edit_bio: boolean;
}

export interface CardSocialProof {
  followed_by_in_network: number;
  vouched_by_in_network: number;
  held_by_in_network: number | null;
  /** Pre-rendered headline like "@simontx, @delegatordan +1 follow this". */
  headline: string | null;
}

/**
 * §N8 claim target — server-resolved (entity_type, entity_id, chain_slug)
 * triple needed by the frontend to drive the four-step claim modal.
 *
 * Null when the page is already claimed (no claim flow needed) or
 * when no on-chain entity backs the page (e.g., member or project
 * cards). Frontend uses this as the gate for rendering the Wanted
 * poster + Claim CTA on validator/creator profiles.
 */
export interface CardClaimTarget {
  entity_type: "validator" | "collection";
  entity_id: number;
  /** e.g. "cosmoshub", "osmosis", "ethereum". Drives the wallet picker. */
  chain_slug: string;
}

/**
 * §K3 — one chain an operator runs on. Server returns a list of these
 * on `Card.chains` only when 2+ chains back the same page (the common
 * single-chain case is null). Drives <ChainTabs /> on the entity
 * profile.
 */
export interface CardChain {
  /** e.g. "cosmoshub", "osmosis". Stable identifier. */
  slug: string;
  /** Display label e.g. "Cosmos Hub", "Osmosis". */
  name: string;
  /** bech32 operator address (cosmosvaloper… on Cosmos chains). */
  operator_address: string;
}

export interface Card {
  id: number;
  name: string;
  handle: string;
  card_kind: CardKind;
  /**
   * Short editorial bio for the back-face render — one paragraph, max
   * ~200 chars, server-truncated at word boundary with "…" suffix.
   * Empty string when the entity hasn't set a bio. Source per kind:
   *   - validator / project / creator → peepso-page post_excerpt
   *   - member → wp_users.description
   */
  bio: string;
  trust_score: number;
  reputation_tier: ReputationTier;
  card_tier: CardTier;
  tier_label: string | null;
  rank_label: string | null;
  is_in_good_standing: boolean;
  flags: string[];
  /** §N8 — true when an operator/creator has verified the page. */
  is_claimed: boolean;
  /** §N8 — non-null when the page is unclaimed AND a claim target resolves. */
  claim_target: CardClaimTarget | null;
  /**
   * §K3 — chains this operator runs on. Server returns the array only
   * when 2+ chains back the same page (one operator linked across
   * Cosmos + Osmosis + Injective, etc.). Null on single-chain pages
   * and on member cards. The frontend's <ChainTabs /> mounts only
   * when this is non-null.
   */
  chains: CardChain[] | null;
  /**
   * §D2 — true when the current viewer has already cast a review on
   * this page. Drives ReviewCallout's "WRITE A REVIEW" → "REMOVE
   * YOUR REVIEW" CTA swap. Always false for anonymous viewers and
   * for member cards (members are reviewed via different surface).
   */
  viewer_has_reviewed: boolean;
  /**
   * §V1.5 — true when the current viewer has already endorsed this
   * page. Drives EndorseButton's "ENDORSE" → "REMOVE ENDORSEMENT"
   * CTA swap. Always false for anonymous viewers and for member cards.
   */
  viewer_has_endorsed: boolean;
  /**
   * §V1.5 — server-rendered tooltip copy for when can_endorse.allowed
   * is false. Null when allowed. Mirrors the can_endorse.unlock_hint
   * value so the EndorseButton can render the hover hint without
   * reaching into the permission object.
   */
  endorse_unlock_hint: string | null;
  crest: CardCrest;
  stats: CardStat[];
  permissions: CardPermissions;
  social_proof: CardSocialProof | null;
  links: {
    self: string;
    binder?: string;
    review?: string;
  };
  /**
   * §3.2.5 server-authoritative endpoint hints for gated card mutations.
   * V1 frontend hardcodes URLs; V1.5 will switch to reading these so URL
   * changes don't require frontend deploys. Optional during the
   * transition.
   */
  actions?: Record<string, CardAction>;
}

/**
 * §3.2.5 HATEOAS hint — one entry in `Card.actions`. Permission to
 * invoke is in `Card.permissions.<key>`; presence here does NOT imply
 * the viewer is allowed.
 */
export interface CardAction {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  href: string;
  body?: Record<string, unknown>;
  idempotent: boolean;
  requires_auth: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Onboarding suggestions
// ─────────────────────────────────────────────────────────────────────

export interface OnboardingSuggestions {
  validators: Card[];
  projects: Card[];
  creators: Card[];
}

// ─────────────────────────────────────────────────────────────────────
// Feed (§F1–§F3, §N6) — cursor-paginated, scope-tabbed
// ─────────────────────────────────────────────────────────────────────

/**
 * Feed scope per §N6 — the three tabs the Floor exposes for logged-in
 * users. Anonymous visitors get the implicit `hot` feed instead.
 *
 *  - for_you   default. F1 ranking applied across content from cards
 *              the viewer follows + high-trust entities + recency
 *  - following strict-time-ordered posts from cards the viewer follows
 *              (excludes signals — those have their own tab)
 *  - signals   on-chain events only, time-ordered
 */
export type FeedScope = "for_you" | "following" | "signals";

/**
 * Author block on every feed item. Loose — backend may expand this
 * over time and the frontend tolerates extra fields.
 */
export interface FeedAuthor {
  user_id: number;
  handle: string;
  display_name?: string;
  avatar_url?: string;
  rank_label?: string | null;
  reputation_tier?: ReputationTier;
  /**
   * §N8 operator badge — true when the author holds a verified
   * operator/creator claim on any entity. Drives the OPERATOR chip
   * next to the author name in feed cards. Server-resolved per §A2.
   */
  is_operator?: boolean;
}

/**
 * Trust-grammar reaction kinds — §D5, locked. Coordinate any change
 * with backend ReactionGrammarMap::TRUST_KINDS.
 */
export type TrustReactionKind = "solid" | "vouch" | "stand_behind";

/**
 * Social-grammar reaction kinds — v1.5 curated subset (👍 ❤️ 😂 😮 🔥).
 * Coordinate any change with backend ReactionGrammarMap::SOCIAL_KINDS.
 */
export type SocialReactionKind = "like" | "love" | "haha" | "wow" | "fire";

/**
 * Union of every kind any grammar exposes. Used wherever a reaction
 * kind appears at the wire boundary (request body, response payload,
 * optimistic cache updates) — the per-grammar narrowing happens at
 * the rail layer (ReactionRail branches on `kind_grammar`).
 */
export type ReactionKind = TrustReactionKind | SocialReactionKind;

/**
 * v1.5 reaction grammar discriminator (api-contract-v1.md §2.11).
 *
 *   - "trust"  — restrained, intentional. solid / vouch / stand_behind.
 *   - "social" — expressive, emoji-forward. like / love / haha / wow / fire.
 *   - "tribal" — reserved for V2 (same_wallet, onchain_confirm, etc.).
 *                Currently no kinds; the discriminator exists so the
 *                rail's grammar-branch is forward-compatible.
 */
export type ReactionGrammar = "trust" | "social" | "tribal";

/**
 * Reactions block aggregated by kind. The active grammar is named in
 * `kind_grammar`; `counts` keys and `viewer_reaction` values both
 * belong to that grammar (the server zero-fills counts for every
 * kind in the grammar, even when zero).
 *
 * Same shape returned by /reactions POST + DELETE responses, so the
 * frontend patches its cache directly without translation.
 */
export interface FeedReactions {
  kind_grammar: ReactionGrammar;
  counts: Record<string, number>;
  viewer_reaction: ReactionKind | null;
}

/**
 * Comment view-model returned by the §4.13 endpoints. One row per
 * visible comment on a parent post.
 *
 * V1 is flat: top-level only, no thread context surfaced (PeepSo's
 * UI shows replies-in-replies via @-mentions in body; the BCC drawer
 * mirrors that approach). No edit; delete + recreate is the model.
 */
export interface CommentAuthor {
  id: number;
  handle: string;
  display_name: string;
  avatar_url: string;
}

export interface Comment {
  /** Form: `comment_<int>`. Treat as opaque. */
  id: string;
  /** Same value as `id` — DELETE takes the id as a path param. */
  comment_id: string;
  /** Echoes the parent post's feed_id, not the comment's own. */
  feed_id: string;
  author: CommentAuthor;
  /** Plain text + newlines; PeepSo sanitizes server-side. */
  body: string;
  /** ISO-8601 UTC. */
  posted_at: string;
  permissions: {
    can_delete: FeedItemPermission;
  };
}

/**
 * Response shape for `GET /posts/:feed_id/comments`. Cursor mirrors
 * the feed cursor encoding so the same `lib/api/client` cursor
 * helpers work without modification.
 */
export interface CommentsResponse {
  items: Comment[];
  next_cursor: string | null;
}

export interface CreateCommentRequest {
  feed_id: string;
  body: string;
}

export interface CreateCommentResponse {
  comment: Comment;
}

export interface DeleteCommentResponse {
  comment_id: string;
}

/**
 * Polymorphic feed item. The `body` shape varies per `post_kind` —
 * left as `Record<string, unknown>` here so the renderer can branch
 * on kind without locking every variant's shape.
 *
 * Stable across kinds: id, post_kind, posted_at, author, links.
 *
 * Known body shapes (informational; not enforced at this layer):
 *   - status      → { text: string, attached_card?: Card }
 *   - pull_batch  → { card_count, more_count, top_cards: [...] }
 *   - page_claim  → { entity_type, role, page_id }
 *   - review      → { grade, text, page_id }
 *   - dispute     → { reason, page_id, status }
 *   - blog_excerpt
 *       Floor context  → { excerpt, full_text: null, author_handle, wp_post_id }
 *       Blog tab ctx   → { excerpt, full_text: string, wp_post_id }
 *     Frontend reads `full_text` to decide whether to render the full
 *     body inline (blog tab) or show an excerpt + "Read full post"
 *     affordance (Floor) — see §D6 / FeedItemNormalizer.
 */
/**
 * Per-action permission entry on a FeedItem. Mirrors the backend
 * shape: `{allowed, unlock_hint}` per key. Known keys today:
 *   can_react · can_reply · can_share · can_report
 * Unknown keys default to `{allowed: false, unlock_hint: null}` if a
 * future backend ships one before the frontend types are bumped.
 */
export interface FeedItemPermission {
  allowed: boolean;
  unlock_hint: string | null;
}

export interface FeedItem {
  id: string;
  post_kind: string;
  external_id: number;
  posted_at: string;
  scope_tags: string[];
  author: FeedAuthor;
  body: Record<string, unknown>;
  reactions: FeedReactions;
  /**
   * v1.5 — number of visible (non-trashed) comments on the post at
   * response-time. Server-computed via batched COUNT(*) GROUP BY.
   * The feed card surfaces this as a chip; clicking the chip
   * lazy-mounts <CommentDrawer /> which fetches the actual list
   * via §4.13.
   */
  comment_count: number;
  permissions: Record<string, FeedItemPermission>;
  links: {
    self: string;
    author: string;
  };
  social_proof?: {
    headline: string | null;
    [key: string]: unknown;
  };
  attached_card?: Card;
  /**
   * Group context for posts authored inside a PeepSo group (§3.3 v1.5).
   * **Omitted** (not null) when the post is not in a group. Drives the
   * "On-Chain Verified" badge on the feed card. Server-side ranking is
   * unaffected by this field in v1 — it's metadata for badge rendering.
   */
  group?: GroupBlock;
}

export interface FeedPagination {
  next_cursor: string | null;
  has_more: boolean;
}

export interface FeedResponse {
  items: FeedItem[];
  pagination: FeedPagination;
}

// ─────────────────────────────────────────────────────────────────────
// Highlights (§O2 / §O2.1)
//
// "What to care about RIGHT NOW" strip atop the Floor feed. Three
// fixed-priority slots; max one item per slot; empty slots collapse.
// Server is the brain (per §A4); the frontend renders 0–3 items in
// the order returned. NEVER re-shuffle.
// ─────────────────────────────────────────────────────────────────────

export type HighlightSlot = "negative" | "positive" | "external";

/**
 * HighlightAction — server-described mutation hook (§A2). The strip's
 * dismiss button reads `actions.dismiss.href`; the frontend doesn't
 * hard-code the URL.
 */
export interface HighlightAction {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  href: string;
  idempotent: boolean;
  requires_auth: boolean;
}

export interface HighlightItem {
  /** Stable id — `h-{slot}-{stable_hash}`. URL-safe, ≤128 chars. */
  id: string;
  slot: HighlightSlot;
  /** Free-form server tag for analytics — not branched on by the UI. */
  category: string;
  /** Pre-rendered title + body strings. No client-side templating (§A2). */
  title: string;
  body: string;
  cta: {
    label: string;
    /** App route. Cast through Route at the call site for typedRoutes. */
    href: string;
  };
  actions: {
    dismiss: HighlightAction;
  };
}

export interface HighlightsResponse {
  items: HighlightItem[];
}

export interface DismissHighlightResponse {
  status: "dismissed";
  id: string;
  /** ISO 8601 UTC. The id stays dismissed until this timestamp passes. */
  expires_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Celebrations (§O1.2) — Heavy-intensity moments delivered out-of-band
// from the originating action, since rank-up subscribers run async per
// §A3. The frontend reads /me/celebrations/pending; renders the toast;
// fires /me/celebrations/consume to clear the stash.
//
// Single-slot per user — a second celebration that lands before the
// first is consumed overwrites. Stacking Heavy moments dilutes them.
// ─────────────────────────────────────────────────────────────────────

/**
 * Stable kind identifier for the Heavy celebration. Today rank_up is
 * the only producer; level_up / tier_upgrade will join as the
 * corresponding listeners land.
 */
export type CelebrationKind = "rank_up" | "level_up" | "tier_upgrade";

export interface Celebration {
  kind: CelebrationKind;
  /** Server-rendered headline. Frontend renders verbatim (§A2). */
  label: string;
  /** Asset key the frontend maps to a Lucide / SVG icon. */
  icon: string;
}

export interface PendingCelebrationResponse {
  /** Null when nothing is stashed for the viewer. */
  celebration: Celebration | null;
}

export interface ConsumeCelebrationResponse {
  ok: true;
}

// ─────────────────────────────────────────────────────────────────────
// Cards list (§G1/§G2 directory) — paginated, filtered.
//
// Same per-item Card view-model as `/cards/:type/:id`, just batched.
// The endpoint (GET /bcc/v1/cards) accepts a small filter set; the
// server runs a single discovery query and hydrates each row.
// ─────────────────────────────────────────────────────────────────────

/** Card kinds the directory surfaces. Members aren't "browsed" here. */
export type DirectoryKind = "validator" | "project" | "creator";

/** Sort modes accepted by the cards-list endpoint. */
export type DirectorySort = "trust" | "newest" | "endorsements" | "followers";

/** Tier values the directory accepts (matches §C1 card_tier; risky hidden). */
export type DirectoryTier = "legendary" | "rare" | "uncommon" | "common";

export interface CardsListQueryParams {
  kind?: DirectoryKind;
  tier?: DirectoryTier;
  sort?: DirectorySort;
  q?: string;
  page?: number;
  per_page?: number;
}

export interface CardsListPagination {
  page: number;
  per_page: number;
  total_pages: number;
  has_more: boolean;
}

export interface CardsListResponse {
  items: Card[];
  pagination: CardsListPagination;
}

// ─────────────────────────────────────────────────────────────────────
// Search suggestions (§G1 nav-bar autocomplete)
//
// Smaller than the full Card view-model — autocomplete needs name +
// tier badge + click-through, not stats or permissions. Emitted by
// /bcc/v1/cards/search, which wraps bcc-search and maps the flat
// reputation-tier / category-slug response into card_tier / card_kind
// per §A2.
// ─────────────────────────────────────────────────────────────────────

export interface SearchSuggestion {
  id: number;
  name: string;
  handle: string;
  card_kind: DirectoryKind;
  /** §C1 — null for risky tier (entity hidden from card UI). */
  card_tier: CardTier;
  tier_label: string | null;
  trust_score: number | null;
  is_verified: boolean;
  /** Pre-built headless route (`/v/:slug`, `/p/:slug`, `/c/:slug`). */
  href: string;
}

export interface SearchSuggestionsResponse {
  items: SearchSuggestion[];
}

// ─────────────────────────────────────────────────────────────────────
// Notifications (§I1)
//
// Server-rendered messages per §A2 — the frontend never templates a
// notification headline from the type code. Each type has a server-
// resolved `link` field for click-through; the bell UI just renders
// the row + navigates.
// ─────────────────────────────────────────────────────────────────────

export type NotificationKind =
  | "bcc_reaction"
  | "bcc_review"
  | "bcc_card_pulled"
  | "bcc_rank_up";

export interface NotificationActor {
  id: number;
  handle: string;
  display_name: string;
  /** May be empty when the user hasn't set an avatar. */
  avatar_url: string;
}

export interface NotificationItem {
  id: number;
  type: NotificationKind;
  /** Pre-rendered headline per §A2. Render verbatim. */
  message: string;
  /** ISO 8601 UTC. May be empty when the source row was malformed. */
  created_at: string;
  read: boolean;
  actor: NotificationActor;
  /** Server-built click-through. Always relative; safe to pass to <Link>. */
  link: string;
}

export interface NotificationsListPagination {
  has_more: boolean;
  /** Pass back as `cursor` to fetch the next page. Null when exhausted. */
  next_cursor: string | null;
}

export interface NotificationsListResponse {
  items: NotificationItem[];
  pagination: NotificationsListPagination;
}

export interface NotificationsUnreadCountResponse {
  unread_count: number;
}

export interface NotificationsMarkReadResponse {
  ok: true;
  updated: number;
}

// ─────────────────────────────────────────────────────────────────────
// Creator gallery (§H1)
//
// Server-shaped per §A2: floor prices, volume, holder counts come back
// as pre-formatted strings. The frontend renders them verbatim — no
// chain-token-symbol mapping in TypeScript, no Intl.NumberFormat per
// row. `is_stale` flags when the visible page has any row past its
// expires_at; the server has already dispatched a background refresh.
// ─────────────────────────────────────────────────────────────────────

export type CreatorGallerySort =
  | "total_volume"
  | "floor_price"
  | "unique_holders"
  | "total_supply"
  | "collection_name";

export interface CreatorGalleryItem {
  id: number;
  contract_address: string;
  chain_slug: string;
  chain_name: string;
  /** Collection name with fallback to truncated contract ("0xabcd…1234"). */
  name: string;
  image_url: string | null;
  total_supply: number | null;
  /** Pre-formatted "1.5 ETH". Null when floor price isn't available. */
  floor_price_label: string | null;
  /** Pre-formatted "2.4M ETH volume". Null when volume isn't available. */
  total_volume_label: string | null;
  /** Pre-formatted "8,231 holders". Null when count isn't available. */
  unique_holders_label: string | null;
  /** Server-built explorer link. Null when chain has no explorer URL. */
  explorer_url: string | null;
}

export interface CreatorGalleryPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

export interface CreatorGalleryResponse {
  items: CreatorGalleryItem[];
  pagination: CreatorGalleryPagination;
  /** True when the visible page has any expired rows. Server has
   *  already dispatched a background refresh; the frontend can show a
   *  light "Refreshing…" hint. Frequently false on a hot creator. */
  is_stale: boolean;
  /** ISO 8601 UTC timestamp of the most-recent fetched_at across the
   *  visible page. Null when the gallery is empty. */
  last_refreshed_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Locals (§E3) — PeepSo Groups projected through BCC's union-local lens.
//
// Single-graph rule (LOCKED): membership lives in PeepSo's
// peepso_group_members ledger. The only per-user state BCC stores is
// wp_usermeta.bcc_primary_local_group_id. The `viewer_membership`
// block on each item is a server-side derivation (membership +
// primary-flag) — not a client-side join.
// ─────────────────────────────────────────────────────────────────────

/**
 * Membership block on a LocalItem. `null` when the viewer is anonymous
 * (no session). Authenticated viewers always get a non-null block; the
 * `is_member` flag inside it is the actual membership state.
 */
export interface LocalMembership {
  is_member: boolean;
  is_primary: boolean;
  /** ISO 8601 UTC. Only populated when is_member is true. */
  joined_at: string | null;
}

export interface LocalItem {
  id: number;
  slug: string;
  /** Server-rendered name, e.g. "Local 342 Cosmos Base Fan". */
  name: string;
  /** Parsed from the name when present (e.g. 342); null otherwise. */
  number: number | null;
  /** Parsed from the name (e.g. "cosmos"); null when no chain keyword detected. */
  chain: string | null;
  member_count: number;
  viewer_membership: LocalMembership | null;
  links: {
    self: string;
  };
}

/**
 * Offset pagination — Locals is a directory, not a stream (per §1.5
 * pagination contract; cursor pagination is reserved for the feed).
 */
export interface LocalsPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface LocalsResponse {
  items: LocalItem[];
  pagination: LocalsPagination;
}

/**
 * Detail response shape — same as a directory `LocalItem` so the
 * client can render either with one component. (Server alignment is
 * load-bearing per §A2; if the detail endpoint diverges, both surfaces
 * must move together.)
 */
export type LocalDetailResponse = LocalItem;

/**
 * POST /me/locals/:id/primary success shape. Carries the updated
 * viewer_membership block so a single cache patch reflects the new
 * `is_primary` state on every Local card without a refetch.
 */
export interface SetPrimaryLocalResponse {
  ok: true;
  group_id: number;
  /** Always populated (server only succeeds when the viewer is a member). */
  viewer_membership: {
    is_member: true;
    is_primary: true;
    joined_at: string | null;
  };
}

/**
 * DELETE /me/locals/primary success shape. Idempotent; clears the
 * pointer regardless of whether one was set.
 */
export interface ClearPrimaryLocalResponse {
  ok: true;
  group_id: null;
}

/**
 * POST /me/locals/:id/membership success shape. Carries the updated
 * viewer_membership block so the detail page can patch its local
 * state without refetching the whole Local. New joiners are never
 * primary by default (server returns `is_primary: false`).
 */
export interface JoinLocalResponse {
  ok: true;
  group_id: number;
  viewer_membership: {
    is_member: true;
    is_primary: false;
    joined_at: string | null;
  };
}

/**
 * DELETE /me/locals/:id/membership success shape. `primary_cleared`
 * is true when the user just left their own primary Local (the server
 * atomically clears `bcc_primary_local_group_id` in that case).
 */
export interface LeaveLocalResponse {
  ok: true;
  group_id: number;
  primary_cleared: boolean;
  viewer_membership: {
    is_member: false;
    is_primary: false;
    joined_at: null;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Holder Groups (§4.7.1) — NFT-gated PeepSo groups.
//
// Backend term: "holder groups." Frontend label: "Communities."
// Wire/type names stay aligned with the backend (HolderGroup*) so a
// debug session can match a JSON response field to its TS shape without
// translation. UI labels live in the components, not in the types.
//
// Three buckets in the GET response — the server has already filtered
// each row into exactly one of them; the frontend MUST NOT re-bucket
// client-side (privacy gate is server-authoritative per §S / §A2):
//   - joined          — viewer is a current member
//   - eligible_to_join — viewer holds the gating NFT but isn't a member
//   - opted_out       — viewer left or was mod-removed (TTL or permanent)
// ─────────────────────────────────────────────────────────────────────

/**
 * Group verification badge (server-authoritative copy per §A2).
 * `label` MUST be rendered verbatim — never abbreviate to "Verified"
 * alone. Contract §4.7.1 line 1460 explicitly bans the abbreviation.
 */
export interface GroupVerification {
  kind: "on_chain";
  label: string;
}

/**
 * Group context block on a `FeedItem` (§3.3 v1.5).
 *
 * Present when the post is a wall post inside a PeepSo group; omitted
 * for non-group posts. `verification` is null for non-NFT-gated kinds
 * (system / user / local) and populated for NFT-gated holder groups.
 *
 * `type` reuses the same union as `GroupDiscoveryItem.type` — same
 * server-side enum (`GroupType` on the backend), no parallel string
 * literal union.
 */
export interface GroupBlock {
  /** group_id — matches §4.7.x endpoint paths. */
  id: number;
  type: GroupDiscoveryType;
  verification: GroupVerification | null;
}

/**
 * Per-group activity block (anti-ghost-town signal). Heat thresholds
 * are server-tuned via the `bcc_group_heat_thresholds` filter — the
 * frontend renders the bucket but doesn't compute it (§S no-business-
 * logic rule).
 *
 * Note: the contract doc (§4.7.1 lines 1465–1469) reserves an
 * `active_members_last_7d` field for v2.5 — the current backend does
 * NOT emit it. When the backend starts emitting it, widen this type.
 */
export interface GroupActivity {
  posts_last_7d: number;
  /** ISO 8601 UTC. Null when no posts in window or timestamp invalid. */
  last_activity_at: string | null;
  heat: "cold" | "warm" | "hot";
  /**
   * Server-authoritative display string for the heat bucket
   * ("Hot" / "Warm" / "Quiet" by default; filterable server-side via
   * `bcc_group_heat_label`). Frontend renders verbatim per §A2 — no
   * client-side `heat === "hot" ? "Hot" : ...` mapping.
   */
  heat_label: string;
}

/**
 * One holder-group row. Same shape across all three buckets in the GET
 * response — the bucket name is the only thing that distinguishes
 * "joined" from "eligible" from "opted_out."
 */
export interface HolderGroupItem {
  group_id: number;
  slug: string;
  name: string;
  member_count: number;
  collection: {
    /** Chain slug (e.g. "ethereum"). Null when chain row missing. */
    chain: string | null;
    /** Always populated — the gate config requires it. */
    contract: string;
    name: string | null;
    image_url: string | null;
  };
  verification: GroupVerification;
  activity: GroupActivity;
}

/** GET /me/holder-groups — three pre-bucketed lists. */
export interface MyHolderGroupsResponse {
  joined: HolderGroupItem[];
  eligible_to_join: HolderGroupItem[];
  opted_out: HolderGroupItem[];
}

/**
 * POST /me/holder-groups/:id/join success.
 * `code` distinguishes a fresh join from an idempotent re-join; both
 * are 200, callers may surface a different toast per code.
 */
export interface JoinHolderGroupResponse {
  joined: true;
  group_id: number;
  code: "ok" | "already_member";
}

/**
 * POST /me/holder-groups/:id/leave success.
 * No `viewer_membership` block (unlike Locals) because holder groups
 * have no primary-pointer concept — just join/leave with TTL'd opt-out.
 */
export interface LeaveHolderGroupResponse {
  left: true;
  group_id: number;
}

/** GET /me/holder-groups/preferences. */
export interface HolderGroupPreferences {
  auto_join: boolean;
}

/**
 * POST /me/groups/:id/join success (§4.7.3 plain group membership).
 * Residual case for non-NFT, non-Local PeepSo groups. Closed/secret
 * groups are rejected server-side with `bcc_permission_denied` —
 * surface `error.message` verbatim (it points at PeepSo's request
 * flow), never substitute a generic 403 string.
 */
export interface JoinPlainGroupResponse {
  joined: true;
  group_id: number;
}

/**
 * POST /me/groups/:id/leave success (§4.7.3).
 * Owners are rejected with `bcc_permission_denied`; render
 * `error.message` verbatim.
 */
export interface LeavePlainGroupResponse {
  left: true;
  group_id: number;
}

// ─────────────────────────────────────────────────────────────────────
// §4.7.2 — Profile Groups Tab (`GET /users/{slug}/groups`)
//
// Cross-kind list of groups the target user is an active member of
// (holder + local + user + system). Each row carries server-built
// action URLs (varying by `type`) and viewer-aware `permissions` per
// §A4 / §N7. V1 frontends may hardcode endpoint paths; V1.5 will
// switch to following `actions[].url`.
// ─────────────────────────────────────────────────────────────────────

/** Server-built action endpoint pointer (per §A2). */
export interface GroupActionUrl {
  url: string;
}

export interface GroupActions {
  join: GroupActionUrl;
  leave: GroupActionUrl;
}

/**
 * Single permission entry (per §A4 / §N7). `unlock_hint` is the
 * server-authoritative copy when `allowed === false` — render
 * verbatim, never substitute.
 */
export interface GroupPermissionEntry {
  allowed: boolean;
  unlock_hint: string | null;
  /**
   * Stable machine-readable reason. Known values per contract §4.7.2:
   * `already_member`, `not_self`, `not_eligible`, `requires_approval`,
   * `invite_only`. Unknown values are tolerated for forward compat.
   */
  reason_code: string | null;
}

export interface GroupPermissions {
  can_join: GroupPermissionEntry;
  can_leave: GroupPermissionEntry;
}

/**
 * One row in `GET /users/:slug/groups`. Same shape across all four
 * group kinds — `type` discriminates which action URLs in `actions{}`
 * point at, and `verification` is null for non-NFT kinds.
 *
 * Reuses `GroupDiscoveryType` / `GroupDiscoveryPrivacy` / `GroupVerification`
 * declared elsewhere — same backend enums (`GroupType`, `PeepSoPrivacy`,
 * `GroupVerification`) apply across §4.7.x.
 */
export interface UserGroupItem {
  group_id: number;
  slug: string;
  name: string;
  type: GroupDiscoveryType;
  /**
   * Server-authoritative display string for the `type` enum
   * ("On-Chain Holders" / "Local" / "System" / "Group" by default;
   * filterable via `bcc_group_type_label`). Frontend renders verbatim
   * per §A2 — no client-side enum→label mapping.
   */
  type_label: string;
  member_count: number;
  privacy: GroupDiscoveryPrivacy;
  verification: GroupVerification | null;
  actions: GroupActions;
  permissions: GroupPermissions;
}

/** GET /users/:slug/groups response. No pagination per contract. */
export interface UserGroupsResponse {
  items: UserGroupItem[];
}

/** PATCH /me/holder-groups/preferences body. */
export interface HolderGroupPreferencesPatch {
  auto_join: boolean;
}

/**
 * PATCH /me/holder-groups/preferences response.
 *
 * `reconciled.joined` reflects the immediate sync sweep when the user
 * just toggled auto_join ON — the server runs the reconcile inline so
 * the user doesn't wait for the next cron tick. When toggling OFF,
 * both fields are 0 (no work to do).
 */
export interface HolderGroupPreferencesUpdateResponse {
  auto_join: boolean;
  reconciled: {
    joined: number;
    skipped: number;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Groups Discovery (§4.7.4) — cross-kind community browse.
//
// Anonymous OR Bearer. Server filters out `secret` privacy and sorts by
// (verified DESC, heat_score DESC, member_count DESC). Closed groups
// appear with name + member_count visible; their content stays private
// at PeepSo's layer. `verification` is null for non-NFT-gated groups
// (system/user/local kinds); when present, render `label` verbatim.
// ─────────────────────────────────────────────────────────────────────

/**
 * Group kind discriminator (matches GroupType enum on the backend).
 *
 *   - "nft"    — NFT-gated holder group (always carries verification block)
 *   - "local"  — chapter / chain Local (browse via /locals/[slug])
 *   - "system" — system-managed group (membership-everyone or similar)
 *   - "user"   — user-created PeepSo group
 */
export type GroupDiscoveryType = "nft" | "local" | "system" | "user";

/**
 * Privacy level. `secret` is documented for completeness but the
 * discovery endpoint excludes secret groups server-side, so callers
 * should never see it in this response.
 */
export type GroupDiscoveryPrivacy = "open" | "closed" | "secret";

/**
 * Market-data block for NFT-gated discovery cards (§4.7.4). Drives
 * the flip-card "back" surface.
 *
 * Two parallel sets of fields:
 *   - **Raw values** (`floor_price`, `unique_holders`, etc.) — preserved
 *     for sorting, charts, future tooling. Each independently nullable
 *     since the upstream fetch can leave any column unpopulated.
 *     Currency-bearing fields are strings (full decimal precision).
 *   - **`*_display` strings** — server-pre-formatted for direct
 *     rendering per §A2 / §S. Frontend renders verbatim — no client-
 *     side number-formatting decisions. Em-dash (`"—"`) when the
 *     underlying value is missing/zero so "0.00 STARS" never surfaces
 *     as a fake-low signal.
 *
 * `distribution_pct` is the server-computed `holders / supply * 100`
 * (rounded), exposed as a number alongside `holders_display` for any
 * downstream chart use. Frontend never recomputes this client-side.
 */
export interface CollectionStats {
  token_standard: string | null;
  total_supply: number | null;
  unique_holders: number | null;
  floor_price: string | null;
  floor_currency: string | null;
  total_volume: string | null;
  listed_percentage: number | null;
  royalty_percentage: number | null;
  distribution_pct: number | null;
  /** Gate threshold (NFTs required to qualify for the holder group). */
  min_balance: number | null;
  floor_display: string | null;
  volume_display: string | null;
  holders_display: string | null;
  supply_display: string | null;
  listed_display: string | null;
  royalty_display: string | null;
  /** "1 NFT" / "5 NFTs" — server-formatted gate threshold. */
  min_balance_display: string | null;
  /**
   * Canonical marketplace link for the underlying NFT collection.
   * `null` when the chain isn't mapped server-side (Solana, NEAR, and
   * the long-tail cosmos chains in V1). Frontend renders the URL with
   * `target="_blank" rel="noopener noreferrer"` and stops propagation
   * on click so opening the marketplace doesn't flip the card back.
   */
  marketplace: { url: string; label: string } | null;
}

export interface GroupDiscoveryItem {
  group_id: number;
  slug: string;
  name: string;
  type: GroupDiscoveryType;
  member_count: number;
  privacy: GroupDiscoveryPrivacy;
  /**
   * Server-authoritative verification badge. Null on non-verified
   * groups; when present, render `label` verbatim per contract §4.7.1
   * line 1460 (banned from abbreviation to "Verified" alone).
   */
  verification: GroupVerification | null;
  /**
   * Plain-text group description (post body, tag-stripped, truncated
   * to ~200 chars with em-dash ellipsis). Null when the group has no
   * description. Applies to all kinds.
   */
  description: string | null;
  /**
   * Cover-art URL (per §4.7.4). NFT-type cards return their underlying
   * collection's image_url; non-NFT kinds return null in V1 (the
   * frontend renders an initials block as fallback). PeepSo group
   * avatars for non-NFT kinds is V1.5.
   */
  image_url: string | null;
  /**
   * Market-data block for NFT cards. Null for `local`/`system`/`user`
   * kinds — there's no equivalent for those.
   */
  collection_stats: CollectionStats | null;
  activity: GroupActivity;
}

/**
 * Same offset shape as LocalsPagination (§1.5 contract). Kept as a
 * distinct interface so a future contract change to one surface
 * doesn't silently move the other.
 */
export interface GroupsDiscoveryPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface GroupsDiscoveryResponse {
  items: GroupDiscoveryItem[];
  pagination: GroupsDiscoveryPagination;
}

// ─────────────────────────────────────────────────────────────────────
// Binder (§C2 — projection of PeepSo follows + bcc_pull_meta sidecar)
// ─────────────────────────────────────────────────────────────────────

/**
 * BinderItem — a single row in /me/binder.
 *
 * Identifier-only by design (§C2): no name/trust/tier/crest fields
 * here. To render a full card, fetch the view-model via
 * `actions.view.href` (`GET /cards/:kind/:id`). The binder page
 * renders slim tiles directly from these fields to avoid N+1
 * lookups; full cards are loaded on click-through.
 *
 * Field semantics (locked, see BinderService::buildItem doc):
 *   - card_handle         always set (bcc_handle)
 *   - card_slug           set when page-backed AND kind is recognized; null otherwise
 *   - card_id             always the followee user_id (NOT post_id)
 *   - is_resolved         true when page-backed (validator/project/creator)
 *   - is_legacy           true when no bcc_pull_meta sidecar (pre-V1 follow);
 *                         these MUST NOT be surfaced as recent pulls
 *   - card_tier_at_pull   §C1 card_tier captured at pull time (snapshot).
 *                         Null for legacy follows OR when the followee was
 *                         risky-tier at pull time. Drives both the tile
 *                         color (`var(--tier-${...})`) and label.
 *   - tier_label_at_pull  pre-rendered display string (§A2) — server picks
 *                         the label, frontend renders verbatim
 *   - pulled_at           ISO 8601 UTC, or null when is_legacy
 */
export interface BinderItemAction {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  href: string;
  idempotent: boolean;
  requires_auth: boolean;
}

export interface BinderItem {
  follow_id: number;
  card_kind: CardKind;
  is_resolved: boolean;
  card_id: number;
  card_handle: string;
  card_slug: string | null;
  page_id: number | null;
  card_tier_at_pull: CardTier;
  tier_label_at_pull: string | null;
  batch_id: string | null;
  pulled_at: string | null;
  is_legacy: boolean;
  links: {
    /** Frontend route for the card detail page. */
    card: string;
  };
  actions: {
    /** API endpoint to fetch the full Card view-model. */
    view: BinderItemAction;
  };
}

export interface PullCardResponse {
  status: "pulled" | "already_pulled";
  item: BinderItem;
}

export interface UnpullCardResponse {
  status: "unpulled";
  follow_id: number;
}

export interface BinderPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface BinderResponse {
  items: BinderItem[];
  pagination: BinderPagination;
}

// ─────────────────────────────────────────────────────────────────────
// Posts (§D1 — composer write side, V1 status only)
// ─────────────────────────────────────────────────────────────────────

/** §D2 character cap on status posts — mirrored client-side for the counter. */
export const STATUS_POST_MAX_LENGTH = 500;

/** §D2 character cap on review bodies. */
export const REVIEW_BODY_MAX_LENGTH = 4000;

/** §D6 — blog excerpt bounds (Floor renders this; full body is unbounded server-side at 60k). */
export const BLOG_EXCERPT_MIN_LENGTH = 80;
export const BLOG_EXCERPT_MAX_LENGTH = 500;
export const BLOG_FULL_TEXT_MAX_LENGTH = 60_000;

export type PostKind = "status" | "review" | "blog";

/** §D2 review grade — symbolic key, server maps to vote_type internally. */
export type ReviewGrade = "trust" | "neutral" | "caution";

export interface CreateStatusRequest {
  kind?: "status";
  content: string;
}

export interface CreateReviewRequest {
  kind: "review";
  /** peepso-page id of the entity being reviewed (validator/project/creator). */
  target_page_id: number;
  grade: ReviewGrade;
  /** Long-form review body (1..REVIEW_BODY_MAX_LENGTH after trim). */
  content: string;
}

/**
 * §D6 — long-form blog post. `content` carries the full_text (rendered
 * inside the per-user blog tab); `excerpt` carries the Floor teaser
 * (rendered on /feed and /feed/hot). Server enforces length bounds.
 */
export interface CreateBlogRequest {
  kind: "blog";
  /** 80..BLOG_EXCERPT_MAX_LENGTH chars after trim. */
  excerpt: string;
  /** 1..BLOG_FULL_TEXT_MAX_LENGTH chars after trim. */
  content: string;
}

export type CreatePostRequest =
  | CreateStatusRequest
  | CreateReviewRequest
  | CreateBlogRequest;

/**
 * Minimal §L5 post-create response. The endpoint deliberately returns
 * pointers rather than a fully-hydrated FeedItem — the frontend
 * invalidates its feed query and re-fetches via FeedRankingService,
 * which is the single source of truth for the hydrated FeedItem
 * (avoids duplicating reactions/permissions hydration).
 *
 * Status returns post_id + act_id (peepso CPT post + activity).
 * Reviews return vote_id + page_id + grade — the `feed_id` is filled
 * by the async ActivityStreamWriter subscriber once the activity row
 * lands; until then it's null and the client just refetches.
 */
export type CreatePostResponse =
  | {
      ok: true;
      kind?: "status";
      feed_id: string;
      post_id: number;
      act_id: number;
    }
  | {
      ok: true;
      kind?: "review";
      feed_id: string | null;
      vote_id: number;
      page_id: number;
      grade: ReviewGrade;
    }
  | {
      ok: true;
      kind?: "blog";
      post_id: number;
      excerpt_length: number;
      full_text_length: number;
    };

// ─────────────────────────────────────────────────────────────────────
// Photo posts (v1.5 — multipart, separate endpoint per §4.14)
// ─────────────────────────────────────────────────────────────────────

/** Caption cap on photo posts — same shape as status (500 chars). */
export const PHOTO_CAPTION_MAX_LENGTH = STATUS_POST_MAX_LENGTH;

/** Hard size cap on uploaded photos (5 MB). Mirrors the server cap. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Allowed mime types for photo uploads. Mirrors the server allowlist. */
export const PHOTO_ALLOWED_MIME_TYPES: ReadonlyArray<string> = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Multipart photo-post request. Caption is optional (photo-only is a
 * real social use case). Server enforces the same caps.
 */
export interface CreatePhotoPostRequest {
  file: File;
  caption?: string;
}

/**
 * Minimal photo-post response. Same `feed_id` echo pattern as status
 * + a `photo_id` (peepso_photos.pho_id) for callers that want to
 * reference the photo directly.
 */
export interface CreatePhotoPostResponse {
  ok: true;
  feed_id: string;
  post_id: number;
  act_id: number;
  photo_id: number;
}

/**
 * Body shape for `post_kind === "photo"` (api-contract-v1.md §3.3.9).
 * Server-resolved per §A2 — every visible field comes from the
 * view-model, no client-side derivation.
 */
export interface PhotoBody {
  /** Optional caption text. `null` for photo-only posts. */
  caption: string | null;
  /** Canonical full image URL. Empty string on degraded reads. */
  photo_url: string;
  /** Always null in V1 — alt text deferred to V2 a11y per §3.3.9. */
  alt: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// GIF posts (v1.5 — JSON, separate endpoint per §4.15)
// ─────────────────────────────────────────────────────────────────────

/** Caption cap on GIF posts — same shape as status / photo. */
export const GIF_CAPTION_MAX_LENGTH = STATUS_POST_MAX_LENGTH;

/**
 * JSON request body for POST /posts/gif. Server requires the URL to
 * contain `giphy.com` (matches PeepSo's own check). Caption optional.
 */
export interface CreateGifPostRequest {
  url: string;
  caption?: string;
}

/**
 * Minimal GIF-post response. Shares the status response shape — no
 * photo_id (GIFs aren't stored in `peepso_photos`; they live as
 * post_meta on the wp_post).
 */
export interface CreateGifPostResponse {
  ok: true;
  feed_id: string;
  post_id: number;
  act_id: number;
}

/**
 * Body shape for `post_kind === "gif"` (api-contract-v1.md §3.3.10).
 * GIF posts are status posts (act_module_id=1) promoted to `gif` by
 * the body hydrator's metadata semantic override (§3.3.11) when the
 * wp_post carries a `peepso_giphy` post_meta.
 */
export interface GifBody {
  /** Optional caption. `null` for GIF-only posts. */
  caption: string | null;
  /** Giphy CDN URL — render with <img src> directly. */
  gif_url: string;
  /** Forward-stable enum; V1 always `'giphy'`. */
  provider: "giphy";
}

/**
 * Giphy integration config returned by GET /integrations/giphy
 * (api-contract-v1.md §4.16). Drives the composer's GIF button visibility
 * + the picker's API calls.
 */
export interface GiphyIntegrationConfig {
  /** True when admin enabled `giphy_posts_enable` AND set an API key. */
  enabled: boolean;
  /** Empty string when disabled. */
  api_key: string;
  /** Giphy content rating: 'g' | 'pg' | 'pg-13' | 'r'. */
  rating: string;
  /** Max GIFs per page in the picker grid. Default 25. */
  display_limit: number;
}

/**
 * Single Giphy GIF result — narrowed to the fields the picker needs.
 * Giphy's full API response has many more fields; we deliberately
 * surface only the subset BCC's UI uses.
 */
export interface GiphySearchResult {
  id: string;
  /** Original/full GIF URL — what we POST to /posts/gif. */
  url: string;
  /** Tiny preview URL for the picker grid (saves bandwidth). */
  preview_url: string;
  width: number;
  height: number;
  /** Alt-text-style description from Giphy. May be empty. */
  title: string;
}

// ─────────────────────────────────────────────────────────────────────
// Wallet challenge / claim (§B5 + §N8)
// ─────────────────────────────────────────────────────────────────────

export interface WalletNonceResponse {
  nonce: string;
  /** UTF-8 message to sign (Keplr signArbitrary input). */
  message: string;
  chain_slug: string;
  chain_id: number;
  wallet_address: string;
  /** ISO-8601, ~5 minute TTL. */
  expires_at: string;
}

export interface LinkWalletRequest {
  wallet_address: string;
  /** base64 signature returned by Keplr's signArbitrary. */
  signature: string;
  /** base64 secp256k1 pubkey value (`pub_key.value` from Keplr). */
  pub_key?: string;
  wallet_type?: string;
  label?: string;
  /**
   * Chain-specific verification context. Cosmos signature verification
   * reads `pub_key` + `chain_id` from here (see WalletVerifier::verify
   * on the backend). The top-level `pub_key` field above is only used
   * by older callers and is ignored by the cosmos verifier.
   */
  extra?: Record<string, unknown>;
}

export interface LinkWalletResponse {
  wallet_link_id: number;
  chain_slug: string;
  chain_name: string;
  address: string;
  verified: true;
}

// Wallet-as-credential auth (post-2026-04-30 V1 extension).
// /auth/wallet-login + /auth/wallet-signup return AuthTokenResponse —
// same shape as /auth/login + /auth/signup, so the session-bridging
// path can stay agnostic to which credential type minted the JWT.

export interface WalletLoginRequest {
  /** bech32/hex address — must match the one the challenge was issued for. */
  wallet_address: string;
  /** base64 signature from the wallet's signArbitrary. */
  signature: string;
  /** Wallet-specific verification data (Keplr pub_key, etc.). */
  extra?: Record<string, unknown>;
}

export interface WalletSignupRequest {
  wallet_address: string;
  signature: string;
  /** §B6 handle rules — server is authoritative. */
  handle: string;
  display_name?: string;
  /** Optional. When blank, server mints a deterministic placeholder. */
  email?: string;
  extra?: Record<string, unknown>;
}

export interface ClaimPageRequest {
  /** peepso-page id. */
  id: number;
  entity_type: "validator" | "collection";
  entity_id: number;
}

export interface ClaimPageResponse {
  ok: true;
  status: "verified" | "already_verified";
  claim_id?: number;
  role: "operator" | "creator" | "holder";
  is_primary?: boolean;
  message?: string;
}

/**
 * §N9 binder identity-snapshot — GET /me/binder/summary.
 *
 * All fields are pre-computed server-side per §A2/§L5. Tier
 * percentages are integer-rounded and may not sum to exactly 100.
 */
export interface BinderTierSlot {
  count: number;
  /** 0-100 integer percentage of the binder. */
  percent: number;
}

export interface BinderTierDistribution {
  legendary: BinderTierSlot;
  rare: BinderTierSlot;
  uncommon: BinderTierSlot;
  common: BinderTierSlot;
  /** Legacy follows pulled before tier_at_pull was tracked. */
  unknown: BinderTierSlot;
}

export interface BinderMonthlyActivity {
  reviews: number;
  solids_received: number;
  disputes_signed: number;
}

export interface BinderSummaryResponse {
  total: number;
  tier_distribution: BinderTierDistribution;
  monthly_activity: BinderMonthlyActivity;
}

// ─────────────────────────────────────────────────────────────────────
// User view-model (§3.1) — GET /bcc/v1/users/:handle response.
//
// This is the FLAT, locked-contract shape the backend returns.
// Earlier scaffolding here described a richer "Phase 4" view-model
// with `card`, `standing`, `stats`, `shift_log`, etc. — none of those
// fields exist in §3.1 today. They survive at the bottom of this file
// as Phase-4 wishlist types for component scaffolding; do NOT
// reference them from MemberProfile until the contract amends per §9.
//
// All values pre-rendered server-side per §A2 (no client-side
// derivation of scores, tiers, ranks, or formatted strings).
// ─────────────────────────────────────────────────────────────────────

/** §2.4 LivingBlock — appears on every User view-model. */
export interface MemberLiving {
  /** Days in a row the member has shown up (UTC, server pre-computed). */
  streak_days: number;
  /**
   * True when the user has had no qualifying activity today;
   * surfaces a soft prompt in the UI per §O3.
   * Optional — current server build omits this; defaults to false.
   */
  streak_at_risk_today?: boolean;
  /**
   * Today's per-kind counts. Zero values ARE returned but the
   * frontend should filter them before rendering "X reviews · Y solids
   * · Z vouches" lines per §O3.
   *
   * Server-side keys cover the V1 wired set (reviews, solids_received,
   * disputes_signed). vouches_received and pulls are optional pending
   * the §D5 reaction-merge aggregator and the §C3 batch counter.
   */
  today: {
    reviews: number;
    solids_received: number;
    vouches_received?: number;
    disputes_signed: number;
    pulls?: number;
  };
  /**
   * Pre-rendered single-line summary of the user's day. Null when
   * nothing of note happened — the frontend falls back to a "Quiet
   * shift" placeholder.
   */
  recent_impact: string | null;
  /**
   * §N11 progression toward next rank — visible always.
   */
  rank_progress: {
    current_rank: string;
    /**
     * The rank key immediately after `current_rank`, or null when
     * the user is at the top of the ladder.
     */
    next_rank: string | null;
    /** 0-100 — percent toward the next rank. */
    percent: number;
    /** Pre-rendered remaining label e.g. "12 reviews to go". */
    remaining_label: string;
  };
  /**
   * §O3.1 social comparison. Server pre-renders the headline; null
   * when the user is too new for a meaningful comparison or in the
   * bottom half of the network (soft phrasing — no "you're behind"
   * framing).
   */
  comparison: {
    /** Pre-rendered, e.g. "Top 5% this week". */
    headline: string;
    /** "network_percentile" | "local_peer". */
    kind: string;
    /** ISO date the comparison was computed (`YYYY-MM-DD`). */
    as_of: string;
  } | null;
}

/** §2.5 ProgressionBlock — own profile only (omitted on others'). */
export interface MemberProgression {
  current_rank: string;
  current_rank_label: string;
  /** Null when at top of the auto-promotion ladder. */
  next_rank: string | null;
  next_rank_label: string | null;
  /** Each metric: how the user is tracking toward `next_rank`. */
  next_rank_thresholds: Array<{
    metric: string;
    label: string;
    current: number;
    required: number;
  }>;
  /** Most recent 5 reputation changes (sorted desc by `at`). */
  trust_score_recent_changes: Array<{
    delta: number;
    reason: string;
    /** ISO date `YYYY-MM-DD`. */
    at: string;
  }>;
}

/** §2.6 FeatureAccessBlock — own profile only. Encodes §O5. */
export interface MemberFeatureAccess {
  level: number;
  level_label: string;
  next_level: number | null;
  next_level_label: string | null;
  next_level_thresholds: Array<{
    metric: string;
    label: string;
    current: number;
    required: number;
  }>;
  /** Each feature: {allowed, unlock_hint}. Keys are canonical contract names. */
  features: Record<string, { allowed: boolean; unlock_hint: string | null }>;
}

/** §2.7 UxHelpersBlock — single dual-label flag. Anonymous viewers always get true. */
export interface MemberUxHelpers {
  show_helpers: boolean;
}

/** Wallet shape inside MemberProfile.wallets. */
export interface MemberWallet {
  id: number;
  /** Full address — own profile only; others' get `address_short` only. */
  address?: string;
  address_short: string;
  chain_slug: string;
  chain_name: string;
  is_primary: boolean;
  /** ISO 8601. May be empty when no verification timestamp was recorded. */
  verified_at: string;
}

/** Local membership entry inside MemberProfile.locals. */
export interface MemberLocal {
  id: number;
  slug: string;
  name: string;
  number: number | null;
  is_primary: boolean;
}

/** Counts strip — followers / following / etc. Server pre-rolled. */
export interface MemberCounts {
  followers: number;
  following: number;
  binder_size: number;
  reviews_written: number;
  disputes_signed: number;
  solids_given: number;
  solids_received: number;
}

/** Privacy block — what's hidden from the viewer (server-decided per §3.1). */
export interface MemberPrivacy {
  binder_hidden: boolean;
  reviews_hidden: boolean;
  disputes_hidden: boolean;
  delegations_hidden: boolean;
  follower_count_hidden: boolean;
  real_name_hidden: boolean;
  email_hidden: boolean;
}

/**
 * Owner-only privacy settings — what GET / PATCH /me/privacy returns.
 *
 * Same seven §K2 keys as `MemberPrivacy`, plus `discovery_optout` —
 * the §G1 PeepSo overlap (opt out of being listed in user search).
 *
 * The eighth flag is intentionally NOT in the user view-model: it
 * affects search-result inclusion, not how the profile page renders,
 * so it lives only behind /me/privacy.
 */
export interface MyPrivacySettings {
  binder_hidden: boolean;
  reviews_hidden: boolean;
  disputes_hidden: boolean;
  delegations_hidden: boolean;
  follower_count_hidden: boolean;
  real_name_hidden: boolean;
  email_hidden: boolean;
  /** §G1: opt out of PeepSo user search. Owner-only. */
  discovery_optout: boolean;
}

/** PATCH body — every key optional; omitted keys are unchanged. */
export type MyPrivacyPatch = Partial<MyPrivacySettings>;

/** Per-action permission with optional unlock copy. */
export interface MemberPermission {
  allowed: boolean;
  unlock_hint: string | null;
}

/**
 * Permissions for what the viewer can do TO this user — distinct from
 * §O5 self-feature gates (those live in feature_access).
 */
export interface MemberPermissions {
  can_follow: MemberPermission;
  can_message: MemberPermission;
  can_block: MemberPermission;
  can_edit_profile: MemberPermission;
}

/** Server-built relative URLs for profile sub-pages. */
export interface MemberLinks {
  self: string;
  binder: string;
  reviews: string;
  activity: string;
  disputes: string;
  network: string;
  blog: string;
}

// ─────────────────────────────────────────────────────────────────────
// Phase-4 wishlist types — NOT in §3.1 contract.
//
// These describe the richer profile shape the design system imagines
// (hero card, stats strip, shift-log grid, reviews/disputes panels,
// tab counts). The backend returns NONE of these on /users/:handle
// today. They survive so component scaffolding compiles; remove or
// wire them when the backend phases up via a §9 contract amendment.
// ─────────────────────────────────────────────────────────────────────

/** Phase-4 placeholder. Today, use top-level `is_in_good_standing` instead. */
export interface MemberStanding {
  is_in_good_standing: boolean;
  since_label: string;
  /** Pre-rendered facts strip on the green ribbon, max ~3 items. */
  facts: string[];
}

/** A single stat in the platform-tagged stats strip. */
export interface MemberStat {
  key: string;
  label: string;
  value: string;
  /** Pre-rendered delta string e.g. "+12 this week"; null when irrelevant. */
  delta: string | null;
  /** "phosphor" → green, "dim" → muted, "safety" → orange, "weld" → yellow. */
  delta_tone: "phosphor" | "dim" | "safety" | "weld" | null;
  /** Optional source tag e.g. "PEEPSO" or "ON-CHAIN". */
  platform: string | null;
}

/** A signed dispute summary — for the profile sidebar list. */
export interface MemberDispute {
  id: number;
  status: "open" | "resolved" | "dismissed";
  status_label: string;
  subject: string;
  body: string;
  scope_label: string;
  posted_at_label: string;
}

/** A review the member has written. */
export interface MemberReview {
  id: number;
  grade: string;
  subject: string;
  subject_handle: string;
  text: string;
  scope_label: string;
  posted_at_label: string;
}

/**
 * Offset pagination block shared by /users/:handle/reviews + /disputes
 * + /me/blocks. Mirrors BinderEndpoint's pagination shape — directory-
 * style, not cursor-style (per the §V1.5 endpoint, where total_pages
 * helps the panel show a count).
 */
export interface OffsetPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// §K1 Phase C — admin moderation queue (GET /admin/reports, POST resolve)
//
// Status int matches the schema: 0 pending, 1 resolved, 2 dismissed.
export type ModerationStatus = 0 | 1 | 2;

/** URL filter for the admin queue. 'all' returns all statuses. */
export type ModerationStatusFilter =
  | "pending"
  | "resolved"
  | "dismissed"
  | "all";

export type ModerationAction = "hide" | "dismiss" | "restore";

export interface ModerationReporterRef {
  user_id: number;
  handle: string;
  display_name: string;
  /** /u/handle path or empty when no handle resolves. */
  profile_url: string;
}

export interface ModerationTargetRef {
  target_kind: "feed_item";
  target_id: number;
  /** Trimmed body text (excerpt for blog, content head for status). Empty for kinds without bodies. */
  preview: string;
  /** peepso act_module_id (status, blog, review, ...). Null when the activity row was deleted. */
  post_kind: string | null;
  /** Author user_id. Null when the activity row was deleted. */
  author_id: number | null;
  /** ISO 8601 UTC. Null when missing. */
  posted_at: string | null;
}

export interface ModerationReportItem {
  id: number;
  status: ModerationStatus;
  status_label: string;
  reason_code: string;
  comment: string;
  /** ISO 8601 UTC. */
  created_at: string;
  reporter: ModerationReporterRef;
  target: ModerationTargetRef;
  /** Whether the target activity is currently in the hidden table. */
  currently_hidden: boolean;
}

export interface ModerationQueueResponse {
  items: ModerationReportItem[];
  pagination: OffsetPagination;
}

export interface ResolveReportRequest {
  action: ModerationAction;
}

export interface ResolveReportResponse {
  ok: true;
  report_id: number;
  action: ModerationAction;
  currently_hidden: boolean;
}

// §K1 Phase B — content reports (POST /me/reports)
//
// Reason taxonomy is locked here in lockstep with ContentReportService::
// REASON_CODES. Adding/renaming a reason needs both edges to ship together.
export type ContentReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "violence"
  | "misinformation"
  | "other";

export type ContentReportTargetKind = "feed_item";

/** Optional comment cap. Mirrors ContentReportService::COMMENT_MAX_LENGTH. */
export const CONTENT_REPORT_COMMENT_MAX_LENGTH = 500;

export interface CreateContentReportRequest {
  target_kind: ContentReportTargetKind;
  target_id: number;
  reason_code: ContentReportReason;
  /** Optional, except when reason_code === "other" (server-enforced). */
  comment?: string;
}

export type CreateContentReportResponse = {
  ok: true;
  report_id: number;
  /** "created" on first file, "existing" on idempotent retry. */
  status: "created" | "existing";
};

/** §K1 Phase A — one row in the viewer's block list. Server-shaped. */
export interface MyBlockEntry {
  user_id: number;
  handle: string;
  display_name: string;
  avatar_url: string;
  /** Pre-resolved /u/handle path; empty string when no handle. */
  profile_url: string;
}

export interface MyBlocksResponse {
  items: MyBlockEntry[];
  pagination: OffsetPagination;
}

/** Result of POST /me/blocks. `state` distinguishes first vs duplicate. */
export interface BlockUserResponse {
  ok: true;
  user_id: number;
  state: "created" | "existing";
}

/** Result of DELETE /me/blocks/:user_id. `removed` is false when no row. */
export interface UnblockUserResponse {
  ok: true;
  user_id: number;
  removed: boolean;
}

/**
 * §V1.5 — paginated reviews response. `hidden=true` when the target
 * user has reviews_hidden=true AND the viewer isn't the owner; the
 * panel renders a "private" placeholder in that case.
 */
export interface UserReviewsResponse {
  items: MemberReview[];
  pagination: OffsetPagination;
  hidden: boolean;
}

/** §V1.5 — paginated disputes response. Same hidden-flag semantics. */
export interface UserDisputesResponse {
  items: MemberDispute[];
  pagination: OffsetPagination;
  hidden: boolean;
}

/** §D5 dispute reason length bounds — mirrored from BCC_DISPUTES_MIN_REASON_LENGTH / MAX in bcc-trust.php. */
export const DISPUTE_REASON_MIN_LENGTH = 20;
export const DISPUTE_REASON_MAX_LENGTH = 1000;

/** §D5 panel size — every dispute is decided by this many jurors. Mirrored from BCC_DISPUTES_PANEL_SIZE. */
export const DISPUTE_PANEL_SIZE = 5;

// ────────────────────────────────────────────────────────────────────────
// Dispute system — V1 Phase 5 verify (§D5).
//
// Two flows:
//   1. OPEN — page owner files a dispute against a downvote on their page
//      (POST /bcc/v1/disputes). Server picks 3 panelists atomically.
//   2. PANEL VOTE — panelist sees their pending queue (GET /disputes/panel)
//      and casts accept/reject (POST /disputes/{id}/vote).
//
// Read flow (already wired): the user's profile "Disputes" tab reads from
// /users/:handle/disputes, which reflects the bcc_trust_flags rows the
// user has filed.
// ────────────────────────────────────────────────────────────────────────

/**
 * One vote on a page that the page owner can choose to dispute. Returned
 * by GET /bcc/v1/disputes/votes/:page_id. Owner-only endpoint (server
 * 403s otherwise). Only `downvote` rows are disputable per §D5; we
 * surface upvotes too so the picker can show context, but the modal
 * disables the "Dispute" button on them.
 */
export interface DisputableVote {
  /** Vote row id — passed back to POST /disputes as `vote_id`. */
  id: number;
  voter_name: string;
  vote_type: "upvote" | "downvote";
  /** Trust-weighted score (rounded to 2dp). */
  weight: number;
  /** Optional review-style reason text. May be empty. */
  reason: string;
  /** ISO 8601 UTC, or null if the vote row predates timestamp tracking. */
  date: string | null;
  /**
   * True when this vote already has an active dispute open. The picker
   * surfaces this so the owner can't double-file (server would 409 anyway).
   */
  already_disputed: boolean;
}

/**
 * Request body for POST /bcc/v1/disputes. Server validates min/max
 * length on `reason` (min from BCC_DISPUTES_MIN_REASON_LENGTH constant).
 * `evidence_url` is optional — frontend sanitizes empty → omitted.
 */
export interface OpenDisputeRequest {
  vote_id: number;
  reason: string;
  evidence_url?: string;
}

/**
 * Response body for POST /bcc/v1/disputes. The server returns the
 * created dispute id, panel size, and a human-readable confirmation
 * message. We surface the message verbatim in the success toast.
 */
export interface OpenDisputeResponse {
  dispute_id: number;
  panelists: number;
  message: string;
}

/**
 * Status enum for a dispute row, mirrored from the backend's
 * BCC\Trust\Disputes\Domain\DisputeStatus class.
 *
 *   - reviewing          → panel still deliberating
 *   - accepted           → panel agreed; the disputed downvote was struck
 *   - rejected           → panel disagreed; the downvote stands
 *   - dismissed          → admin force-resolved against the reporter
 *   - timeout_no_quorum  → TTL expired before quorum; downvote stands but
 *                          no reporter penalty (distinguished from rejected
 *                          on purpose)
 *   - closed             → PRESENTATION-ONLY mask. The server returns this
 *                          to panelists who haven't seen full deliberation
 *                          (per the controller's privacy contract), so the
 *                          tally can't be inferred from a status flip.
 *                          Never appears in the DB.
 */
export type DisputeStatus =
  | "reviewing"
  | "accepted"
  | "rejected"
  | "dismissed"
  | "timeout_no_quorum"
  | "closed";

/**
 * One row in the /disputes/panel queue (panelist view) or /disputes/mine
 * list (reporter view). Both endpoints share the same shape via the
 * controller's formatDispute() helper. `my_decision` is non-null only on
 * the panel endpoint AND only after the panelist has voted on this row.
 *
 * Privacy contract from the controller: the server **hides** vote tallies
 * (`accepts` / `rejects`) and the reporter identity from panelists
 * during deliberation, to enforce independent decision-making. Treat
 * those fields as "may be 0/empty during reviewing"; render guarded UI.
 */
export interface PanelDispute {
  /** Dispute id — passed to POST /disputes/{id}/vote. */
  id: number;
  vote_id: number;
  page_id: number;
  page_title: string;
  voter_name: string;
  /** Empty when hidden from the viewer (panelist during reviewing). */
  reporter_name: string;
  reason: string;
  /** Empty string when no evidence link was attached. */
  evidence_url: string;
  status: DisputeStatus;
  accepts: number;
  rejects: number;
  panel_size: number;
  /**
   * The viewer's own decision. Only present on panel-queue rows; null
   * until the viewer has voted. /disputes/mine never sets this.
   */
  my_decision: "accept" | "reject" | null;
  /** ISO 8601 UTC. */
  created_at: string;
  /** ISO 8601 UTC. Null while still reviewing. */
  resolved_at: string | null;
}

/**
 * Request body for POST /bcc/v1/disputes/{id}/vote. `note` is optional
 * panelist-only context for the audit log; never shown to other panelists.
 */
export interface CastPanelVoteRequest {
  decision: "accept" | "reject";
  note?: string;
}

/**
 * §D5 — participation skip codes. `null` when credited; otherwise a
 * stable string the frontend maps to copy. `service_unavailable` is
 * a frontend sentinel used when the controller's try/catch swallowed
 * an exception — the server will never set this string itself.
 */
export type ParticipationSkipReason =
  | "daily_cap"
  | "total_cap"
  | "suspended"
  | "fraud_flag"
  | "linked_users"
  | "low_quality"
  | "already_recorded"
  | "service_unavailable";

/**
 * Inline participation block on the cast-vote response. Tells the
 * panelist whether their vote earned a participation credit (and if
 * not, why). Counts are POST-vote so the toast can render
 * "X / DAILY_CAP today" without a follow-up fetch.
 */
export interface PanelVoteParticipation {
  credited: boolean;
  /** Null when credited; non-null when skipped or unrecorded. */
  reason: ParticipationSkipReason | null;
  credited_today: number;
  credited_lifetime: number;
}

/**
 * Response body for POST /bcc/v1/disputes/{id}/vote. The server deliberately
 * **omits** running tallies from this response (per the controller comment:
 * "panelists must not see running totals before all votes are in"). We
 * surface the confirmation message in a toast and trust the next /panel
 * fetch to refresh state.
 *
 * The `participation` block is the panelist's own credit status — it is
 * NOT a leak of the dispute's tally and is safe to surface immediately.
 */
export interface CastPanelVoteResponse {
  message: string;
  decision: "accept" | "reject";
  participation: PanelVoteParticipation;
}

/**
 * §D5 — viewer's own panel-vote participation totals. Returned by
 * GET /bcc/v1/disputes/participation/me. Powers the /panel header
 * progress indicator.
 *
 * Two parallel views of the same data:
 *   - row counts (credited_today / credited_lifetime / correct_count)
 *     drive "X votes today" UI
 *   - earned trust (earned_today / earned_lifetime) drive
 *     "Y / Z trust points" UI
 *
 * Caps come along so the frontend never mirrors backend constants.
 */
export interface MyParticipationStatus {
  /** Row count: credited panel votes in the trailing 24h window. */
  credited_today: number;
  /** Row count: credited panel votes lifetime. */
  credited_lifetime: number;
  /**
   * Row count: credited rows whose decision matched the dispute's
   * final outcome. Only counts disputes that resolved with a clear
   * verdict — timeout disputes leave outcome_match NULL and don't
   * contribute.
   */
  correct_count: number;
  /** Trust points earned (clamped at caps.daily_trust) in last 24h. */
  earned_today: number;
  /** Trust points earned (clamped at caps.lifetime_trust) lifetime. */
  earned_lifetime: number;
  caps: {
    /** Max trust points earnable per 24h window (1.0 today). */
    daily_trust: number;
    /** Max trust points earnable lifetime (10.0 today). */
    lifetime_trust: number;
    /** Credited-row floor before accuracy bonus kicks in (5 today). */
    min_for_accuracy: number;
    /** Per-credited-vote weight (0.01 today). */
    base_weight: number;
    /** Per-correct-vote weight added on top of base (0.02 today). */
    accuracy_weight: number;
  };
}

/** Live-shift feed row — recent on-chain activity attributed to the member. */
export interface MemberLiveShiftEvent {
  id: string;
  /** Pre-rendered short label e.g. "Pulled OSMO-VALIDATOR-7". */
  label: string;
  /** Pre-rendered short timestamp e.g. "2m". */
  ago: string;
  /** Optional metric e.g. "+RARE". */
  metric: string | null;
}

/** 52-week shift-log cell. Server pre-computes the bucket. */
export interface ShiftLogDay {
  date: string;
  /** 0–4 intensity bucket. 0 = empty, 4 = furnace. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Pre-rendered tooltip e.g. "Mar 12 · 4 actions". */
  tooltip: string;
}

/** Per-activity-type breakdown that sits next to the shift log. */
export interface MemberActivityBreakdown {
  key: "pulls" | "reviews" | "reactions" | "disputes" | "posts";
  label: string;
  description: string;
  count: number;
  delta_label: string | null;
  /** Visual swatch: which accent the icon panel uses. */
  tone: "safety" | "weld" | "ink" | "verified";
}

/** Profile tab counts (header strip). */
export interface MemberTabCount {
  key: "binder" | "reviews" | "activity" | "disputes" | "network" | "groups";
  label: string;
  count: number;
  /**
   * §K2: server marks a tab `hidden=true` for non-self viewers when the
   * owner has hidden that surface. Frontend renders a "private" placeholder
   * inside the tab body; the count remains 0 from the server.
   */
  hidden: boolean;
}

/**
 * Phase-4 rich profile shape — kept as an alias for back-compat with
 * existing component prop types. The server now returns this shape on
 * `GET /users/:handle` (composed by MemberProfileComposer alongside
 * the §3.1 base), so consumers can use either name interchangeably.
 *
 * Prefer `MemberProfile` in new code; this alias may be removed in a
 * future contract amendment once all imports converge.
 */
export type Phase4MemberProfile = MemberProfile;

// ─────────────────────────────────────────────────────────────────────
// MemberProfile — §3.1 User view-model, what GET /users/:handle returns.
// ─────────────────────────────────────────────────────────────────────

/**
 * §3.1 User view-model.
 *
 * Own-only blocks (`living`, `progression`, `feature_access`,
 * `ux_helpers`) are present when `is_self === true` and OMITTED ENTIRELY
 * (not null) on others' profiles. Optional in the type accordingly.
 *
 * `wallets[].address` is the same: present on own profile, omitted for
 * others' (privacy floor — only `address_short` leaks across users).
 */
export interface MemberProfile {
  id: number;
  /** Alias of `id`. Server emits both so callers using either name work. */
  user_id: number;
  handle: string;
  display_name: string;
  avatar_url: string;
  /**
   * §3.1 cover_photo_url — absolute URL to the user's PeepSo cover
   * photo, or null when no custom cover is set. Frontend renders a
   * default treatment in the null case.
   */
  cover_photo_url: string | null;
  /**
   * §3.1 cover_photo_position — crop position percentages (0–100)
   * for the cover photo. `{x: 50, y: 50}` is center (the default).
   * Always present; backed by PeepSo's
   * peepso_cover_position_x / peepso_cover_position_y user_meta.
   */
  cover_photo_position: { x: number; y: number };
  /** ISO 8601 UTC. */
  joined_at: string;
  is_self: boolean;
  trust_score: number;
  reputation_tier: ReputationTier;
  card_tier: CardTier;
  tier_label: string | null;
  rank: string;
  rank_label: string;
  is_in_good_standing: boolean;
  /** V1 catalogue: suspended, shadow_limited, hidden, under_review. */
  flags: string[];
  /** Plain string. Server-sanitized. §3.1 contract. */
  bio: string;
  /**
   * Pre-shaped bio for the rich profile components — paragraphs,
   * signature line, and viewer-aware edit flag. Server reshapes
   * `bio` into this triple per §A2 so the page renders verbatim
   * without a client-side `split('\n\n')` derivation. Always
   * present in the response (even when bio is empty: paragraphs
   * is a single empty string).
   */
  bio_block: {
    paragraphs: string[];
    signature_line: string;
    is_editable: boolean;
  };
  primary_local: { id: number; slug: string; name: string; number: number | null } | null;
  locals: MemberLocal[];
  wallets: MemberWallet[];
  counts: MemberCounts;
  privacy: MemberPrivacy;
  permissions: MemberPermissions;
  /**
   * §K1 Phase A — true when the viewer is currently blocking this
   * profile's owner. Drives the Block/Unblock CTA copy. Always false
   * for anonymous viewers and self-views.
   */
  viewer_blocking: boolean;
  links: MemberLinks;
  // Own-only blocks — present iff `is_self === true`.
  living?: MemberLiving;
  progression?: MemberProgression;
  feature_access?: MemberFeatureAccess;
  ux_helpers?: MemberUxHelpers;
  // ── Phase 4 rich-profile additions composed by MemberProfileComposer ──
  // These ship on every profile fetch (own + others) so the page can
  // render with a single SSR call. Per §A2 every formatted string is
  // server-rendered.
  card: Card;
  standing: MemberStanding;
  identity_meta: Array<{ label: string; value: string }>;
  stats: MemberStat[];
  shift_log: {
    days: ShiftLogDay[];
    summary: string;
    month_ticks: string[];
  };
  activity_breakdown: MemberActivityBreakdown[];
  reviews: MemberReview[];
  disputes: MemberDispute[];
  live_shift: MemberLiveShiftEvent[];
  tabs: MemberTabCount[];
}

// ────────────────────────────────────────────────────────────────────────
// §V1.5 OAuth connections (X + GitHub).
//
// Backend lives at /wp-json/bcc-trust/v1/{x,github}/* — see XController
// + GitHubController. The auth-init endpoint returns an OAuth URL the
// caller redirects the browser to; the callback redirects back with a
// ?x_verified=success|error or ?github_verified=success|error param.
// ────────────────────────────────────────────────────────────────────────

/** GET /x/auth → opaque auth URL the browser redirects to. */
export interface XAuthUrlResponse {
  auth_url: string;
}

/** GET /x/status — disconnected vs connected shape. */
export type XStatusResponse =
  | { connected: false }
  | {
      connected: true;
      username: string;
      verified_at: string | null;
      last_synced: string | null;
    };

/** POST /x/disconnect. */
export interface XDisconnectResponse {
  disconnected: true;
  username: string | null;
}

/** POST /x/verify-share — confirms the user actually tweeted the site URL. */
export interface XVerifyShareResponse {
  verified: boolean;
  already_done?: boolean;
  message?: string;
}

/** GET /github/auth → opaque auth URL the browser redirects to. */
export interface GitHubAuthUrlResponse {
  auth_url: string;
}

/** GET /github/status — disconnected vs connected shape. */
export type GitHubStatusResponse =
  | { connected: false }
  | {
      connected: true;
      username: string;
      verified_at: string | null;
      last_synced: string | null;
      followers: number;
      repos: number;
      orgs: number;
    };

/** POST /github/disconnect. */
export interface GitHubDisconnectResponse {
  disconnected: true;
  username: string | null;
}

/** POST /github/refresh — re-fetches GH stats (followers/repos/orgs). */
export interface GitHubRefreshResponse {
  refreshed: true;
  followers?: number;
  repos?: number;
  orgs?: number;
}

// ────────────────────────────────────────────────────────────────────────
// §V1.5 — linked wallets (§B2 multi-wallet linking).
//
// Backend: WalletController. GET /wallets lists the current user's wallet
// links; DELETE /wallets/:id unlinks one. Idempotent — DELETE on a
// missing/foreign id returns removed:false rather than 404.
// ────────────────────────────────────────────────────────────────────────

export interface LinkedWallet {
  id: number;
  wallet_address: string;
  chain_slug: string;
  chain_name: string;
  /** "evm", "cosmos", "solana", etc. — drives icon mapping. */
  chain_type: string;
  /** Block explorer URL for this chain (server-built). */
  explorer_url: string;
  /** "user" for self-linked, "project" when attached to a project page. */
  wallet_type: string;
  /** Optional human label (rare in V1; usually empty). */
  label: string;
  is_primary: boolean;
  verified: boolean;
  created_at: string | null;
}

export interface MyWalletsResponse {
  items: LinkedWallet[];
}

export interface UnlinkWalletResponse {
  ok: true;
  id: number;
  removed: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// §I1 V1.5 — notification preferences (bell event toggles + email digest).
//
// Backend: NotificationPrefs / MyNotificationPrefsEndpoint. Storage in
// wp_usermeta `bcc_notif_pref_*`. Per-flag defaults: email_digest off,
// all bell events on.
// ────────────────────────────────────────────────────────────────────────

/**
 * Bell event types that carry a user-facing toggle. Mirrors
 * NotificationType::ALL — names match 1:1 across the stack so a
 * cross-stack grep finds both sides cleanly.
 */
export type BellEventType =
  | "bcc_reaction"
  | "bcc_review"
  | "bcc_card_pulled"
  | "bcc_rank_up"
  | "bcc_endorse";

export interface NotificationPrefs {
  email_digest: boolean;
  bell: Record<BellEventType, boolean>;
  push: PushPrefs;
}

/**
 * PATCH body — every key optional. Bell / push may carry only the
 * events the user is changing; missing types are left untouched on
 * the server.
 */
export interface NotificationPrefsPatch {
  email_digest?: boolean;
  bell?: Partial<Record<BellEventType, boolean>>;
  push?: PushPrefsPatch;
}

// ────────────────────────────────────────────────────────────────────────
// V2 Phase 1 — web push.
//
// Backend: NotificationPrefs::PUSH_TYPES + MyPushSubscriptionEndpoint.
// The push event taxonomy is intentionally narrower than the bell —
// bell shows everything; push is "you really need to know" only.
// ────────────────────────────────────────────────────────────────────────

/**
 * Push event keys — must match NotificationPrefs::PUSH_TYPES on the
 * server. Short forms because they're scoped to the `push.events`
 * sub-object; the dispatcher maps each to its underlying source hook
 * (e.g. `review` ← `bcc_review_published`).
 */
export type PushEventType =
  | "review"
  | "endorse"
  | "dispute_outcome"
  | "panelist_selected";

export interface PushPrefs {
  enabled: boolean;
  events: Record<PushEventType, boolean>;
}

export interface PushPrefsPatch {
  enabled?: boolean;
  events?: Partial<Record<PushEventType, boolean>>;
}

// ────────────────────────────────────────────────────────────────────────
// Members directory — GET /bcc/v1/members.
//
// Slim, list-shaped read of every member. Sibling to the entity-card
// directory (validator/project/creator); this one shows humans. Click
// a card → navigate to /u/:handle for the full profile.
//
// Backed by UserViewService::getSummary on the server. Privacy is
// honored at the server: a member with `real_name_hidden` set shows up
// here with display_name = "@handle".
// ────────────────────────────────────────────────────────────────────────

export interface MemberSummary {
  id: number;
  handle: string;
  display_name: string;
  /** Absolute URL or empty string when no avatar resolved. */
  avatar_url: string;
  /** ISO 8601 UTC. */
  joined_at: string;
  /**
   * §C1 card-tier slug. Mirrors the same field on the full `MemberProfile`
   * (`/users/:handle`); surfaced here so list-shaped UIs can encode the
   * tier as a color/border accent on the rank chip rather than rendering
   * `tier_label` as a duplicate word. Null only for risky-tier users.
   */
  card_tier: CardTier;
  /** "Legendary" / "Rare" / "Uncommon" / "Common" / null (risky tier). */
  tier_label: string | null;
  /** "Apprentice" / "Journeyman" / etc. — never null, falls back to "". */
  rank_label: string;
  is_in_good_standing: boolean;
  /** Moderation/account flags ("suspended", "fraud_review", etc.). */
  flags: string[];
  /**
   * Augmented trust score per §D5 — base reputation_score + clamped
   * lifetime participation bonus, [0, 100]. The directory's anchor
   * "is this a real operator?" number; everything else is decoration.
   */
  trust_score: number;
  /**
   * Watchers count (followers, passive side of `peepso_follower`).
   * Frontend renders with the floor's term ("watchers"); the wire
   * field stays `followers_count` to match the §3.1 `counts.followers`
   * naming on the full profile.
   */
  followers_count: number;
  /**
   * The user's primary Local — the row pointed to by their
   * `bcc_primary_local_group_id` user_meta. Null when no primary set
   * (or the pointer no longer resolves to an active Local). Same
   * shape as `MemberProfile.primary_local`.
   */
  primary_local:
    | { id: number; slug: string; name: string; number: number | null }
    | null;
  /**
   * Count of PeepSo pages this user owns (`peepso_page_members`
   * rows where `pm_user_status = 'member_owner'`). `> 0` is the
   * "this user is a builder/operator, not just a community member"
   * signal. The directory card now uses `owned_pages_by_type` for
   * the typed-badge rendering; this raw count stays in the wire
   * format for callers that don't need the breakdown.
   */
  owned_pages_count: number;
  /**
   * Per-canonical-type count of `member_owner` pages, derived from
   * the PeepSo page-categories taxonomy. Each bucket counts pages
   * tagged with the corresponding category — pages can be tagged
   * with multiple categories, so the sum across types may exceed
   * `owned_pages_count` for a multi-categorized portfolio. Pages
   * with no recognized category don't contribute to any bucket.
   *
   * Type slugs are stable (`validator | project | nft | dao`) and
   * decoupled from the underlying PeepSo category slugs (which
   * are admin-controlled and may include legacy typos).
   */
  owned_pages_by_type: {
    validator: number;
    project: number;
    nft: number;
    dao: number;
  };
}

/**
 * §4.4 `/members?type=...` filter — canonical type slugs accepted by
 * the directory's type filter. Mirror of `MemberSummary.owned_pages_by_type`
 * keys; intentionally identical so a chip click uses the same slug as
 * the badge it lights up.
 */
export type MembersTypeFilter = "validator" | "project" | "nft" | "dao";

/**
 * §4.4 `type_counts` — global count of distinct users with ≥1 owned
 * page per canonical type. Independent of the active `q` and `type`
 * filters: the directory's chip strip uses these to render
 * `VALIDATORS · 5`, and a filter-specific empty state uses them to
 * suggest alternative non-zero chips.
 */
export type MembersTypeCounts = {
  [Type in MembersTypeFilter]: number;
};

export interface MembersResponse {
  items: MemberSummary[];
  pagination: OffsetPagination;
  type_counts: MembersTypeCounts;
}
