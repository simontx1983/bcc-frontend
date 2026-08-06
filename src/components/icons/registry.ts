/**
 * Icon registry — one concept, one icon, product-wide.
 *
 * Icons on the trading card render at 14px, so every candidate here was
 * judged at 14px rather than at gallery size. Several otherwise-obvious
 * choices lose their silhouette entirely at that scale.
 *
 * State is carried by FILL and LABEL, never by swapping the glyph. That
 * is forced rather than preferred: no monitoring glyph in lucide has
 * plus/check/minus siblings, so Watch physically cannot use a glyph
 * family — and running Watch on one system while Vouch used another
 * would make two adjacent buttons obey different rules.
 *
 * Rejected, and not to be relitigated:
 *   Radar        — smudge at 14px
 *   Telescope    — illegible at 14px
 *   Handshake    — mush below 20px, and implies a mutual act
 *   UserRoundPlus— means "add a person"; vouch targets aren't always
 *                  people, and reusing it for Join would make one glyph
 *                  mean two different things
 *   Bell*        — notification preference, wrong layer entirely
 *   LogIn        — means "sign in"; the real auth flow will want it
 *
 * A hand-rolled set predates this at components/feed/actionIcons.tsx.
 * Prefer lucide via this registry for anything new.
 */

export {
  /** Watch — survives 14px, and carries no view-count baggage. */
  Binoculars as WatchIcon,
  /** Vouch — a mark you put on something, on the record. */
  Stamp as VouchIcon,
  /** Join — you *enter* a Hall, which is the product's own word for it. */
  DoorOpen as JoinIcon,
  /** Flip — turn the object over. */
  RotateCcw as FlipIcon,
  /** Views — RESERVED. Not in use yet; freed by moving Watching to Binoculars. */
  Eye as ViewsIcon,
  /** Vouched-by, list rows only — a completed fact, never an offer. */
  BadgeCheck as VouchedByIcon,
} from "lucide-react";
