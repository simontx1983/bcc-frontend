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
    /**
     * Optional structured context for the error. Per the §3.3.12
     * contract, `bcc_invalid_mention_target` carries `{user_id}` and
     * `bcc_too_many_mentions` carries `{max}`. Absent on errors that
     * don't surface structured payloads. Future error codes MUST
     * document the keys they place here.
     */
    data?: Record<string, unknown>;
  };
  _meta: ApiMeta;
}

/** Thrown by the client wrapper on any non-2xx envelope. */
export class BccApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly responseBody: ApiErrorBody | null;
  public readonly data: Record<string, unknown> | null;

  constructor(code: string, message: string, status: number, body: ApiErrorBody | null) {
    super(message);
    this.name = "BccApiError";
    this.code = code;
    this.status = status;
    this.responseBody = body;
    this.data =
      body !== null && typeof body.error.data === "object" && body.error.data !== null
        ? body.error.data
        : null;
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
  /**
   * §I1 chrome signal — whether the viewer holds "Member in Good Standing"
   * status. Resolved fresh at login server-side from the reputation tier;
   * carried through the NextAuth JWT until the next login. Drives the
   * SiteFooter contextual stamp.
   *
   * Bounded-staleness V1 posture: if a user falls out of good standing
   * mid-session, the chrome stamp persists until next login (or until the
   * BCC JWT expires + the session re-authenticates).
   */
  in_good_standing: boolean;
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
  /**
   * §J.6 Trust Attestation Layer permission extensions. Optional on
   * the FE type during the Phase 1 backend rollout; backend ships
   * these gates in Week 2 of the Phase 1 plan. Per §N7 the
   * AttestationActionCluster hides each action when its permission
   * entry is absent, then surfaces it (enabled or disabled with
   * unlock_hint) once the gate ships.
   *
   * Note: the attestation-layer Dispute primitive uses the existing
   * `can_dispute` field above — same gate, target_kind expands to
   * include user_profile in Phase 1.5 per §J.1.
   */
  can_vouch?: CardPermissionEntry;
  can_stand_behind?: CardPermissionEntry;
  can_report?: CardPermissionEntry;
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
  /** e.g. "cosmos", "osmosis", "ethereum". Drives the wallet picker. */
  chain_slug: string;
}

/**
 * §K3 — one chain an operator runs on. Server returns a list of these
 * on `Card.chains` only when 2+ chains back the same page (the common
 * single-chain case is null). Drives <ChainTabs /> on the entity
 * profile.
 */
export interface CardChain {
  /** e.g. "cosmos", "osmosis". Stable identifier. */
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
  /**
   * §4.20 cosmetic rename of `trust_score`. Backend dual-emits during
   * the Phase 1 release cycle per §J.11. FE prefers `reputation_score`
   * when present; falls back to `trust_score`. Optional during the
   * Phase 1 backend rollout.
   */
  reputation_score?: number;
  /**
   * §J.3.2 asymmetric-display rule: positive-only public badge.
   * Absent (undefined / null) when the entity hasn't earned one.
   */
  reliability_standing?: ReliabilityStandingPublic | null;
  /**
   * §J.6 aggregate attestation counts. Optional during Phase 1
   * rollout; surfaces render empty-state copy when absent.
   */
  attestation_summary?: AttestationSummary;
  /**
   * §J.6 derived negative signals composing with the divergence_state
   * classification. Optional — backend ships when synthesis layer is
   * live.
   */
  negative_signals?: NegativeSignals;
  /**
   * §J.6 viewer-aware attestation relationship. Coexists with the
   * legacy `viewer_has_endorsed` boolean during the Phase 1
   * "endorse collapses into vouch" migration per §J.11.
   */
  viewer_attestation?: ViewerAttestation;
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
  /** Plain text + newlines; PeepSo sanitizes server-side. May contain raw `@peepso_user_<id>(name)` tokens — overlay via `mentions` per §3.3.12. */
  body: string;
  /** §3.3.12 mention overlay. Always present (`[]` when no mentions). */
  mentions: Mention[];
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
  /**
   * §G2 — restrict results to operators in good standing (tier ≥
   * neutral on the server). Composes with `tier` via AND server-side.
   */
  good_standing_only?: boolean;
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
  | "bcc_rank_up"
  | "bcc_endorse"
  | "bcc_welcome"
  | "bcc_mention"
  | "bcc_local_post"
  | "bcc_comment_received";

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
// NftPiece (§3.7 / §H1, V2 Phase 6) — per-piece detail view-model.
//
// One row per uniquely-identified NFT, addressed by
// (chain_slug, contract_address, token_id). Returned by §4.17
// `GET /bcc/v1/nft-pieces/{chainSlug}/{contractAddress}/{tokenId}`.
//
// Wire shape is snake_case verbatim per §3.7. The frontend renders
// every server-formatted string as-is (`address_short`,
// `meta.indexer_state_label[chain]`); no client-side derivation of
// presentation. `permissions` is `{}` in V2 Phase 6 — no per-piece
// viewer-aware actions yet.
// ─────────────────────────────────────────────────────────────────────

/**
 * One trait/value pair on an NFT piece (OpenSea convention).
 * `rarity_pct` is OPTIONAL — present only when the indexer has
 * computed the trait's frequency across the collection. `attributes`
 * is `[]` (never `null`) when the piece has no metadata.
 */
export interface NftPieceAttribute {
  trait_type: string;
  /** Wire type accepts string | number | boolean per §3.7. */
  value: string | number | boolean;
  rarity_pct?: number;
}

/**
 * Co-owner row in `NftPiece.owners[]` (ERC-1155 only). Privacy-redacted
 * server-side: wallet-only, no `is_linked` / `user` enrichment — only
 * the dominant `owner` gets handle resolution.
 */
export interface NftPieceCoOwner {
  wallet_address: string;
  /** §1.7 wallet pattern: `<first-6>…<last-4>`. */
  address_short: string;
  /** Actual SUM(balance) for ERC-1155; not used for ERC-721 / CW-721. */
  balance: number;
}

/**
 * Dominant holder for the NFT piece. `null` for ERC-721 / CW-721
 * cold-cache (no on-chain holder known yet). For ERC-1155, the
 * top-balance holder, ties broken by lowest wallet_address lex.
 *
 * `user` is non-null IFF `is_linked` is true — the wallet has a
 * BCC-linked user behind it. Frontend MUST NOT invent a user link
 * when `is_linked === false`.
 */
export interface NftPieceOwner {
  wallet_address: string;
  /** §1.7 wallet pattern: `<first-6>…<last-4>`. */
  address_short: string;
  balance: number;
  is_linked: boolean;
  user: {
    id: number;
    handle: string;
    display_name: string;
    avatar_url: string;
  } | null;
}

/**
 * GET /bcc/v1/nft-pieces/{chainSlug}/{contractAddress}/{tokenId}
 * — full piece-detail view-model (§3.7).
 *
 * Routing identity is `(collection.chain_slug, collection.contract_address,
 * token_id)`; `id` is opaque (`nft_piece_<chain>_<short-contract>_<tokenId>`)
 * and treated as a string by the frontend.
 *
 * `token_id` is a STRING — CW-721 token IDs are arbitrary, ERC-1155
 * token IDs exceed `Number.MAX_SAFE_INTEGER`. NEVER coerce to Number.
 *
 * `meta.indexer_state` keys are chain slugs (e.g. `"ethereum"`); the
 * value is one of the §3.6 status strings. `meta.indexer_state_label`
 * carries the server-pre-formatted label per §S — render verbatim
 * when non-empty, never invent copy.
 */
export interface NftPiece {
  /** Opaque identifier — `nft_piece_<chain>_<short-contract>_<tokenId>`. */
  id: string;
  collection: {
    /** Numeric collection row id; null for read-time chains (Cosmos)
     *  with no persistent backing row. */
    id: number | null;
    /** Collection display name; null when the chain has no metadata yet. */
    name: string | null;
    /** Slug of the creator who owns this collection's profile, when
     *  one exists. Null for collections without a claimed creator —
     *  frontend falls back to `(chain_slug, contract_address)` for
     *  breadcrumb routing. */
    creator_handle: string | null;
    chain_slug: string;
    /** Canonical chain-form address (EVM lowercased, Solana base58,
     *  Cosmos bech32). */
    contract_address: string;
    /** ∈ {`ERC-721`, `ERC-1155`, `SPL`, `CW-721`}; null on cold cache. */
    token_standard: string | null;
    /** Admin-managed flag. Unverified pieces are still served; the
     *  field is a tier hint, not a hard gate. */
    is_verified: boolean;
  };
  /** STRING per §3.7. Never coerce to Number. */
  token_id: string;
  /** Display name; null when the piece has no metadata. UI falls back
   *  to `Untitled #{token_id}`. */
  name: string | null;
  /** Plain-text description; null when absent. UI hides the section
   *  entirely on null — never render an empty paragraph. */
  description: string | null;
  /** Full-resolution asset URL (absolute per §1.7); null on cold cache. */
  image_url: string | null;
  /** CDN-resized thumbnail (≤512 px on the long edge); falls back to
   *  `image_url` when no resize is available. */
  image_url_thumb: string | null;
  /** OpenSea-convention trait list. `[]` (never `null`) on no metadata. */
  attributes: NftPieceAttribute[];
  /** Single dominant holder; null on cold cache for ERC-721/CW-721. */
  owner: NftPieceOwner | null;
  /** Total distinct holder count. `1` for ERC-721/CW-721 with a known
   *  holder; `0` when no holder is known. ERC-1155: count of wallets
   *  with `balance > 0`. */
  owners_count: number;
  /** ERC-1155 only: top-N holders by balance, server-capped at N=10.
   *  Empty (`[]`) for ERC-721 / CW-721. */
  owners: NftPieceCoOwner[];
  /** Per-chain marketplace links, server-curated from
   *  `bcc_onchain_chains.marketplace_template`. `[]` when no template. */
  marketplace_links: { name: string; url: string }[];
  /** Relative path to the creator's mint surface with the token
   *  pre-selected. Null when no mint surface exists. */
  mint_link: string | null;
  /** Reserved for future viewer-aware actions; `{}` in V2 Phase 6. */
  permissions: Record<string, never>;
  meta: {
    /** True for chains with no persistent indexer (Cosmos in V2
     *  Phase 6 — read-time + V1-transient per pattern-registry). */
    read_time: boolean;
    /** §3.6 status by chain slug. ∈ {`healthy`, `syncing`, `degraded`}. */
    indexer_state: Record<string, "healthy" | "syncing" | "degraded">;
    /** Server-pre-formatted human copy per §S — render verbatim when
     *  non-empty; never substitute client copy. Empty string for
     *  healthy chains. */
    indexer_state_label: Record<string, string>;
    /** §3.7: server-pre-formatted multi-holder summary (e.g.,
     *  `"Held by 8 collectors"`). `null` for ERC-721 / CW-721 / SPL
     *  and for ERC-1155 with `owners_count <= 1`. Frontend renders
     *  verbatim; presence (non-null) is the signal to also render
     *  `owners[]` co-owner tiles. The FE MUST NOT compose its own
     *  count-with-noun string from `owners_count` (§S). */
    owners_summary_label: string | null;
  };
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
  /**
   * §4.7.6 — when present and > 0, the post lands inside that PeepSo
   * group's wall (server sets `peepso_group_id` post-meta). The viewer
   * MUST be an active member of the group; the server returns 403
   * `bcc_permission_denied` otherwise. Omit / 0 → posts to viewer's
   * own wall (existing behavior).
   */
  group_id?: number;
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

/**
 * Alt-text cap on photo posts (§3.3.9 / §4.18). Mirrors
 * `PhotoAltRepository::ALT_TEXT_MAX_LENGTH` and the
 * `bcc_photo_alts.alt_text` VARCHAR(500). A11y best practice is
 * 125–150 chars — the cap is generous enough for descriptions of
 * complex images while blocking alt-stuffing abuse.
 */
export const PHOTO_ALT_MAX_LENGTH = 500;

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
 *
 * §4.7.6 — `group_id` (when present and > 0) scopes the post to a
 * PeepSo group's wall; member-only on the server. Omit / 0 → viewer's
 * own wall.
 */
export interface CreatePhotoPostRequest {
  file: File;
  caption?: string;
  group_id?: number;
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
  /** §3.3.12 mention overlay extracted from caption. Always present. */
  mentions: Mention[];
}

// ─────────────────────────────────────────────────────────────────────
// GIF posts (v1.5 — JSON, separate endpoint per §4.15)
// ─────────────────────────────────────────────────────────────────────

/** Caption cap on GIF posts — same shape as status / photo. */
export const GIF_CAPTION_MAX_LENGTH = STATUS_POST_MAX_LENGTH;

/**
 * JSON request body for POST /posts/gif. Server requires the URL to
 * contain `giphy.com` (matches PeepSo's own check). Caption optional.
 *
 * §4.7.6 — `group_id` (when present and > 0) scopes the post to a
 * PeepSo group's wall; member-only on the server. Omit / 0 → viewer's
 * own wall.
 */
export interface CreateGifPostRequest {
  url: string;
  caption?: string;
  group_id?: number;
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
  /** §3.3.12 mention overlay extracted from caption. Always present. */
  mentions: Mention[];
}

// ─────────────────────────────────────────────────────────────────────
// Mentions (v1.5 — Phase 1d, api-contract-v1.md §3.3.12 + §4.4)
// ─────────────────────────────────────────────────────────────────────

/**
 * Hard cap on @-mentions per post body / caption / comment.
 * Server enforces; UI hint mirrors so the composer can disable submit
 * with a "max N mentions" affordance before round-tripping.
 *
 * Per §3.3.12 — over-cap returns `bcc_too_many_mentions` with
 * `{max: 10}` echoed in the error payload.
 */
export const MENTIONS_PER_POST_MAX = 10;

/**
 * Wire format token written into the post body. Must match exactly
 * what PeepSo's `Tags::after_save_post` regex extracts so the
 * notification dispatcher fires.
 *
 * Source of truth: `peepso/classes/tags.php` `get_tag_template`.
 */
export function buildMentionToken(userId: number, displayName: string): string {
  return `@peepso_user_${userId}(${displayName})`;
}

/**
 * §3.3.12 Mention overlay row.
 *
 * **INVARIANT**: `range` references **raw stored body offsets** (UTF-16
 * code units, matching JavaScript `String.prototype.substring`). Future
 * formatting layers (markdown, emoji, embeds, contentEditable) MUST
 * overlay AROUND these ranges, never through them. Always render via
 * `text.substring(range[0], range[1])` against the raw body.
 */
export interface Mention {
  user_id: number;
  /** BCC handle at response time. Frontend routes to `/u/:handle`. */
  handle: string;
  /** Display name at response time. Render this; ignore the `(name)` literal in the wire token. */
  display_name: string;
  /** For hovercard / popover usage. */
  avatar_url: string;
  /** [start, end] in UTF-16 code units. End-exclusive. */
  range: [number, number];
}

/**
 * §4.4 GET /users/mention-search response — slim candidate row used
 * by the composer's autocomplete dropdown. Distinct from the directory
 * `MemberSummary` shape (no follower counts, no rank, no card tier —
 * the picker is keystroke-driven and shouldn't enumerate group
 * affiliation or rep tier through repeated prefix queries).
 */
export interface MentionSearchCandidate {
  user_id: number;
  handle: string;
  display_name: string;
  avatar_url: string;
}

export interface MentionSearchResponse {
  items: MentionSearchCandidate[];
}

/**
 * Body shape for `post_kind === "status"` (api-contract-v1.md §3.3.1).
 * Frontends MAY narrow `FeedItem.body` to this when `post_kind` is
 * `"status"`. Renderers that just walk `body.text` + `body.mentions`
 * don't need the type — they can read from the loose
 * `Record<string, unknown>` body field directly.
 */
export interface StatusBody {
  text: string;
  /** Reserved for future link/card embeds. Always `[]` in V1. */
  embeds: unknown[];
  /** §3.3.12 mention overlay. Always present (`[]` when no mentions). */
  mentions: Mention[];
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
  /**
   * §J.6 Trust Attestation Layer permission extensions for
   * user_profile target_kind. Optional during Phase 1 rollout.
   * `can_dispute` exists for user-profile attestations once the
   * panel mechanics extend to user_profile (Phase 1.5).
   */
  can_vouch?: MemberPermission;
  can_stand_behind?: MemberPermission;
  can_dispute?: MemberPermission;
  can_report?: MemberPermission;
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

/**
 * §K1 admin queue post-kind filter — narrow the queue to reports
 * whose target peepso_activities row has the given act_module_id.
 * Mirrors the kinds the queue's hydration cares about (see
 * ModerationQueueService::shapeTarget). Server validates against
 * the same enum.
 */
export type ModerationTargetPostKind =
  | "status"
  | "blog"
  | "review"
  | "photo"
  | "gif";

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

/**
 * Server-issued single-use recovery descriptor returned on every
 * successful resolve action. Drives the §K1 undo-toast affordance.
 *
 * IMPORTANT — see pattern-registry.md "Moderation recovery
 * affordances": this is a 30-second misclick recovery window, NOT a
 * historical-correctness mechanism. The frontend MUST treat it as
 * decorative chrome that can fail to render (the token is `null` when
 * the server skipped issuance) or expire on its own clock. The
 * server-side TTL is authoritative — the countdown is decoration.
 */
export interface ModerationUndoDescriptor {
  /** 32-char hex (^[a-f0-9]{32}$). Single-use. */
  token: string;
  /** ISO 8601 UTC. Drives the countdown rendered on the toast. */
  expires_at: string;
  /** Server's TTL value at issuance — typically 30. */
  ttl_seconds: number;
}

export interface ResolveReportResponse {
  ok: true;
  report_id: number;
  action: ModerationAction;
  currently_hidden: boolean;
  /**
   * Recovery affordance descriptor. `null` when the server elected
   * not to issue a token (defensive-dismiss fallback path, or
   * transient write failed). The frontend treats `null` as "no
   * toast" — the forward action still committed.
   */
  undo: ModerationUndoDescriptor | null;
}

/** Response from POST /bcc/v1/admin/reports/undo. */
export interface UndoReportResponse {
  ok: true;
  report_id: number;
  undone_action: ModerationAction;
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
  /** Pre-rendered short label e.g. "Watched OSMO-VALIDATOR-7". */
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

// ─────────────────────────────────────────────────────────────────────
// §4.20 Trust Attestation Layer view-model extensions
//
// View-model fields added to MemberProfile and Card per the §J wire
// contract. All optional on the FE type — backend may emit them in
// later Phase 1 increments; the FE renders sensible empty states when
// they're absent.
//
// See `docs/trust-attestation-layer.md` (constitution) and
// `docs/api-contract-v1.md` §4.20 §J.6 for the full contract.
// ─────────────────────────────────────────────────────────────────────

/**
 * Positive-only public reliability badge per §J.3.2 asymmetric-display
 * rule. There is NO negative public badge — operators whose reliability
 * softens simply lose their positive badge, never gaining a negative one.
 */
export type ReliabilityStandingPublic =
  | "highly_reliable"
  | "consistent"
  | "newly_active";

/**
 * Five-state synthesis classifier per §J.2. Mutually exclusive — every
 * entity falls into exactly one state. `polarizing` is intelligence,
 * not condemnation; `disputed` flags active multi-claim contention;
 * `well_regarded` and `untested` surface without alarm UI.
 */
export type DivergenceState =
  | "untested"
  | "well_regarded"
  | "poorly_regarded"
  | "polarizing"
  | "disputed";

/**
 * Aggregate attestation counts for an entity card or operator profile.
 * Server-rolled per §A2; FE never derives.
 */
export interface AttestationSummary {
  vouch_count: number;
  stand_behind_count: number;
}

/**
 * Derived negative signals composing with the divergence_state
 * classification. Per §J.4.1 synthesis-invisibility, these are
 * OUTCOMES of the synthesis math — never the rules themselves.
 */
export interface NegativeSignals {
  /** Active dispute (state ∈ open/in_panel). Real-time flag. */
  under_review: boolean;
  /** Five-state divergence classification. */
  divergence_state: DivergenceState;
  /** Rapid reputation_score swing in a rolling window (nightly worker). */
  volatile: boolean;
  /** Open dispute + open content-report total. */
  unresolved_claims_count: number;
}

/**
 * Whether the viewer has cast an attestation on this target.
 * Self-aware per §A2 — server resolves the viewer relationship.
 */
export interface ViewerAttestation {
  vouch: { id: number; created_at: string } | null;
  stand_behind: { id: number; created_at: string } | null;
}

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
  /**
   * §4.20 cosmetic rename of `trust_score`. Backend dual-emits during
   * the Phase 1 release cycle per §J.11 migration. FE prefers
   * `reputation_score` when present; falls back to `trust_score`.
   * Optional on the FE type because backend may not ship it in the
   * earliest Phase 1 increments.
   */
  reputation_score?: number;
  /**
   * §J.3.2 asymmetric-display rule: positive-only public badge. Absent
   * (undefined) when the operator hasn't earned a public badge. Null
   * is reserved for explicit "no current standing" semantics from the
   * server; FE treats undefined and null the same way.
   */
  reliability_standing?: ReliabilityStandingPublic | null;
  /**
   * §J.6 aggregate attestation counts. Optional during Phase 1
   * rollout; FE renders empty-state copy when absent.
   */
  attestation_summary?: AttestationSummary;
  /**
   * §J.6 derived negative signals composing with the divergence_state
   * classification. Optional — backend ships when synthesis layer is
   * live.
   */
  negative_signals?: NegativeSignals;
  /**
   * §J.6 viewer-aware attestation relationship — does the viewer
   * currently have a vouch / stand_behind cast against this target?
   * Optional during Phase 1 rollout.
   */
  viewer_attestation?: ViewerAttestation;
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
  | "bcc_endorse"
  | "bcc_welcome"
  | "bcc_mention"
  | "bcc_local_post"
  | "bcc_comment_received";

export interface NotificationPrefs {
  email_digest: boolean;
  bell: Record<BellEventType, boolean>;
  push: PushPrefs;
  /**
   * Server-side push capability flag. True when the BCC_PUSH_VAPID_PUBLIC_KEY
   * wp-config constant is configured (the server can actually deliver
   * push). False otherwise — frontends should hide / disable the
   * "Enable push" CTA on a false value, even when the browser supports
   * push, to avoid a click-and-fail flow on cold start.
   *
   * Optional in the type for backward-compatibility with stale clients
   * during deploy windows; the server emits it unconditionally on
   * /me/notification-prefs responses (server-rendered as `false` when
   * the constant is missing rather than omitted). Treat `undefined` the
   * same as `false`.
   *
   * @since 2026-05-13 — stabilization-plan Phase β / item 2
   */
  push_available?: boolean;
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
  | "panelist_selected"
  | "mention"
  | "local_post"
  | "comment_received";

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
  /**
   * §3.1 cover_photo_url mirrored onto the slim summary so the
   * directory's flippable card front face can render the cover
   * image. Null when the user hasn't set a custom cover; frontend
   * renders a tier-tinted gradient fallback in that case.
   */
  cover_photo_url: string | null;
  /**
   * Identity proofs for the back-of-card "Verified" panel.
   * `x_verified` / `github_verified` are true only when an active,
   * verified row exists in `bcc_trust_user_verifications`; the
   * `*_username` siblings carry the public handle for click-through
   * display. `wallets_verified` is the count of verified wallet
   * links — per-wallet detail lives on `MemberProfile.wallets`.
   */
  verifications: {
    x_verified: boolean;
    x_username: string | null;
    github_verified: boolean;
    github_username: string | null;
    wallets_verified: number;
  };
  /**
   * Lifetime activity counts for the back-of-card "On The Floor"
   * panel. `endorsements_received` aggregates across all pages this
   * user owns. `solids_received` counts `KIND_SOLID` reactions on
   * activities the user owns (returns 0 when the reaction set isn't
   * seeded yet). `reviews_written` and `disputes_signed` mirror the
   * `MemberCounts` fields of the same name.
   */
  engagement: {
    endorsements_received: number;
    solids_received: number;
    reviews_written: number;
    disputes_signed: number;
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
 * §4.4 `rank` filter — slug of an EXPLICITLY-AWARDED rank from
 * `bcc_user_ranks` (auto-derived Apprentice fallbacks are not
 * included; see UserRankRepository::getUserIdsWithRank docblock).
 * Mirror of `RankCatalog::RANK_*` slugs.
 */
export type MembersRankFilter = "apprentice" | "journeyman" | "foreman";

/**
 * §4.4 `verified[]` filter — one verification axis. Multi-select
 * with AND semantics: passing `["x", "github"]` returns members
 * with BOTH X and GitHub verified.
 */
export type MembersVerifiedAxis = "x" | "github" | "wallet";

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

// ─────────────────────────────────────────────────────────────────────
// Group Detail Page (§4.7.5 / §4.7.6 / §4.7.7) — cross-kind single-group
// view-model + scoped feed + paginated roster.
//
// SOURCE OF TRUTH for these shapes is the PHPDoc on
// `GroupsService::getGroup` and `GroupMembersService::listMembers` —
// the contract doc additions for §4.7.5/§4.7.6/§4.7.7 were promised
// but never merged, so the PHP is canonical.
//
// Privacy gate is server-enforced (defense-in-depth, §S):
//   secret + non-member → 404 (never leaks existence)
//   closed + non-member → 200 with feed_visible=false, members_visible=false
//   open OR member      → full view-model
//
// Frontend rule (§A2 / §S): NO client-side eligibility recomputation.
// Render strictly off `feed_visible`, `members_visible`, and the
// `permissions` block; surface `unlock_hint` strings VERBATIM.
// ─────────────────────────────────────────────────────────────────────

/**
 * Per-permission entry on the detail-page response. Same shape as
 * `GroupPermissionEntry` (§4.7.2) but kept distinct so a future
 * divergence (e.g. detail-page-only `requires_2fa` reason) doesn't
 * silently widen the §4.7.2 surface.
 */
export interface GroupDetailPermissionEntry {
  allowed: boolean;
  unlock_hint: string | null;
  /**
   * Stable machine-readable reason. Known values per
   * `GroupsService::resolveCanJoin` / `resolveCanLeave` /
   * `resolveCanReadFeed`:
   *   `auth_required`, `already_member`, `not_member`,
   *   `not_eligible`, `requires_approval`, `invite_only`,
   *   `membership_required`. Unknown values tolerated for forward
   *   compat — never branch UI off the message text.
   */
  reason_code: string | null;
}

/**
 * Permissions block on `GroupDetailResponse`. Adds `can_read_feed`
 * versus `GroupPermissions` (§4.7.2) — the §4.7.5 detail page is the
 * only surface that needs it because it's the only one that renders
 * the scoped feed inline.
 */
export interface GroupDetailPermissions {
  can_join: GroupDetailPermissionEntry;
  can_leave: GroupDetailPermissionEntry;
  can_read_feed: GroupDetailPermissionEntry;
}

/**
 * Viewer's membership block on the detail response. Cross-kind shape
 * — no `is_primary` (that's a Local-only concept on `LocalMembership`).
 *   - viewer anon                       → null
 *   - viewer authed, not active member  → {is_member: false, joined_at: null}
 *   - viewer authed, active member      → {is_member: true, joined_at: <iso>}
 */
export interface GroupViewerMembership {
  is_member: boolean;
  /** ISO 8601 UTC. Only populated when `is_member` is true. */
  joined_at: string | null;
}

/**
 * GET /bcc/v1/groups/{slug} — single-group detail view-model.
 *
 * Shape mirrors `GroupsService::getGroup`'s PHPDoc exactly; see
 * the PHP file for the canonical definition of each field.
 *
 * `feed_visible` / `members_visible` are server-rendered booleans the
 * frontend uses to decide whether to mount the feed / roster sections
 * (vs the gated-notice fallback). The frontend does NOT recompute
 * either from `permissions` + `privacy` + `type` — that would
 * duplicate the server's privacy gate (§S).
 */
export interface GroupDetailResponse {
  id: number;
  slug: string;
  name: string;
  type: GroupDiscoveryType;
  privacy: GroupDiscoveryPrivacy;
  /** Plain-text body, tag-stripped, truncated to ~200 chars. */
  description: string | null;
  /** NFT-cover URL when `type === "nft"`; null otherwise. */
  image_url: string | null;
  member_count: number;
  /** On-chain badge for NFT groups; null for local/system/user. */
  verification: GroupVerification | null;
  activity: GroupActivity;
  /** Market-data block for NFT groups; null for non-NFT kinds. */
  collection_stats: CollectionStats | null;
  viewer_membership: GroupViewerMembership | null;
  permissions: GroupDetailPermissions;
  feed_visible: boolean;
  members_visible: boolean;
  links: { self: string };
}

/**
 * One row in `GET /bcc/v1/groups/{id}/members`.
 *
 * Wire shape: `MemberSummary` (from §4.4) merged with the per-row
 * group-membership fields. The server `array_merge`s the summary
 * with `{role, role_label, joined_at}` so the public type extends
 * `MemberSummary`. `joined_at` here is the per-group join timestamp
 * (overrides the user's account `joined_at` from the summary —
 * intentional; the roster cares about when this user joined the
 * GROUP, not the platform).
 */
export interface GroupMember extends MemberSummary {
  /** Normalized role — PeepSo `member_owner` / `member_moderator`
   *  / `member_manager` collapsed to this triple per
   *  `GroupMembersService::normalizeRole`. */
  role: "owner" | "moderator" | "member";
  /** Server-rendered display string ("OWNER" / "MODERATOR" /
   *  "MEMBER" by default; filterable via `bcc_group_role_labels`).
   *  Render verbatim per §A2 — no client-side enum→label mapping. */
  role_label: string;
  /** ISO 8601 UTC — when this user joined THIS group. */
  joined_at: string;
}

/**
 * Offset pagination shape used by §4.7.7. Distinct from
 * `OffsetPagination` (page-based) because the roster is offset-based
 * (`offset` / `limit` / `total` / `has_more`) — stable-ordered by
 * (role_rank, joined_at DESC) so offset paginates correctly without
 * timestamp drift.
 */
export interface GroupMembersPagination {
  offset: number;
  limit: number;
  total: number;
  has_more: boolean;
}

export interface GroupMembersResponse {
  items: GroupMember[];
  pagination: GroupMembersPagination;
}

// ────────────────────────────────────────────────────────────────────────
// Onchain — user NFT selections (§ Phase 2 picker UI).
//
// Backend: NftSelectionController @ /bcc/v1/nft-selections/* — picker
// data, current list, save, delete, refresh, reorder. Full picker modal
// is the v1 UI surface; reorder + refresh are deferred to a later pass.
// ────────────────────────────────────────────────────────────────────────

/**
 * One holdings item from GET /nft-selections/picker. Mirrors the
 * HoldingsService row shape with the `is_selected` flag NftSelectionService
 * annotates server-side. Optional fields are optional in the payload —
 * not all chain indexers ship name / image / metadata for every token.
 */
export interface NftPickerItem {
  chain_id: number;
  contract_address: string;
  token_id: string;
  wallet_link_id: number;
  is_selected: boolean;
  name?: string | null;
  collection_name?: string | null;
  image_url?: string | null;
  metadata_uri?: string | null;
  token_standard?: string | null;
}

/**
 * Response body for GET /nft-selections/picker. `selected_keys` is
 * `chain|contract|token` lowercased — we don't lean on it client-side
 * (each item carries `is_selected`) but it's exposed for parity with
 * the backend doc.
 *
 * `meta.indexer_state_label` is server-pre-formatted human copy (per §S);
 * the picker renders it verbatim if non-empty without massaging the text.
 */
export interface NftPickerResponse {
  items: NftPickerItem[];
  truncated: boolean;
  wallets_checked: number;
  wallets_truncated: number;
  selected_keys: Record<string, boolean>;
  refreshed_at: Record<string, string>;
  meta: {
    indexer_state: Record<string, string>;
    indexer_state_label: Record<string, string>;
  };
}

/**
 * One row from GET /nft-selections (the list of saved selections).
 * Returned by NftSelectionRepository::getForUser — joins the chains
 * table for chain_slug / chain_name / explorer_url so the UI can
 * render badges + outbound links without a second fetch.
 *
 * Numeric fields arrive as strings from $wpdb->get_results unless
 * the backend explicitly casts them; both shapes are accepted here
 * to match the contract verbatim.
 */
export interface NftSelectionRow {
  id: number | string;
  user_id: number | string;
  wallet_link_id: number | string;
  chain_id: number | string;
  contract_address: string;
  token_id: string;
  collection_name: string | null;
  name: string | null;
  image_url: string | null;
  metadata_uri: string | null;
  token_standard: string | null;
  display_order: number | string;
  added_at: string;
  chain_slug: string;
  chain_name: string;
  explorer_url: string | null;
}

export interface NftSelectionsListResponse {
  items: NftSelectionRow[];
}

/** Body for POST/DELETE /nft-selections — token identity tuple. */
export interface NftSelectionIdentity {
  chain_id: number;
  contract_address: string;
  token_id: string;
}

/** POST /nft-selections success body. The 403 / 500 paths throw BccApiError. */
export interface NftSaveSelectionResponse {
  ok: true;
  id: number | null;
}

/** DELETE /nft-selections success body. */
export interface NftDeleteSelectionResponse {
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// §4.19 Direct Messages (v1.5)
//
// BCC adapter on top of PeepSo's `peepso_message_*` graph + the
// `peepso-message` CPT. Single-graph rule on the server: writes go
// through PeepSoMessageWriter, reads through PeepSoMessageRepository.
// Frontend never touches PeepSo's tables directly.
// ─────────────────────────────────────────────────────────────────────

/** Hard cap on a message body — mirrors server `MESSAGE_BODY_MAX_LENGTH`. */
export const MESSAGE_BODY_MAX_LENGTH = 5000;

/** Slim author / participant view-model used in inbox + thread + picker. */
export interface MessageUserMini {
  id: number;
  handle: string;
  display_name: string;
  avatar_url: string;
}

/** One message in a thread. `is_inline_notice` flags PeepSo system rows. */
export interface MessageItem {
  id: number;
  author: MessageUserMini | null;
  body: string;
  posted_at: string;
  is_inline_notice: boolean;
}

export interface ConversationLastMessage {
  id: number;
  author: MessageUserMini | null;
  preview: string;
  posted_at: string;
}

/**
 * Conversation summary in the inbox. `peer` is the OTHER participant
 * for 1-on-1s and `null` for groups (where `is_group === true` and the
 * row title falls back to a participants list).
 */
export interface ConversationSummary {
  id: number;
  is_group: boolean;
  participants: MessageUserMini[];
  peer: MessageUserMini | null;
  last_message: ConversationLastMessage;
  unread_count: number;
  last_activity: string;
}

export interface ConversationDetail {
  id: number;
  is_group: boolean;
  participants: MessageUserMini[];
  peer: MessageUserMini | null;
}

export interface ConversationListResponse {
  items: ConversationSummary[];
  pagination: OffsetPagination;
}

/** Thread offset pagination — `total` is unbounded; walk via `has_more`. */
export interface ThreadPagination {
  page: number;
  per_page: number;
  total: number | null;
  has_more: boolean;
}

export interface ConversationThreadResponse {
  conversation: ConversationDetail;
  items: MessageItem[];
  pagination: ThreadPagination;
}

export interface StartConversationRequest {
  recipient_id: number;
  body: string;
}

export interface SendMessageRequest {
  body: string;
}

export interface SendMessageResponse {
  conversation_id: number;
  message_id: number;
  is_new_conversation: boolean;
}

export interface UnreadMessageCountResponse {
  count: number;
}
