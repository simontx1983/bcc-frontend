/**
 * /u/[handle]/twitter-image — Twitter card image.
 *
 * Re-exports the same generated card as opengraph-image.tsx so the
 * `twitter:image` tag points at the identical branded PNG. Keeping a
 * single source for the card means tier color / layout changes land on
 * both surfaces at once.
 *
 * Next's metadata convention requires the `size` / `contentType` / `alt`
 * exports to live on the twitter-image module too, so we re-export them.
 */

export { size, contentType, alt } from "./opengraph-image";
export { default } from "./opengraph-image";
