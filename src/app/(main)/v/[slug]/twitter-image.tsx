/**
 * /v/[slug]/twitter-image — Twitter card image.
 *
 * Re-exports the generated validator card from opengraph-image.tsx so the
 * `twitter:image` tag points at the identical branded PNG. Single source
 * means layout / tier-color changes land on both surfaces at once. Next's
 * metadata convention requires the size / contentType / alt exports on the
 * twitter-image module too, so we re-export them.
 */

export { size, contentType, alt } from "./opengraph-image";
export { default } from "./opengraph-image";
