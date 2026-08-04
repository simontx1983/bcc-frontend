/**
 * Tour DOM helpers.
 *
 * `firstVisibleMatch` is the key to responsive targeting: the same
 * `data-bcc-tour` name is often present on BOTH a desktop element (left
 * sidebar) and its mobile twin (bottom nav / off-canvas), with the
 * off-viewport one hidden via `display:none` (→ a 0×0 rect). Picking the
 * first VISIBLE match means a step highlights whichever affordance the
 * current viewport actually shows, instead of pointing at a hidden node.
 */

export function firstVisibleMatch(selector: string): Element | null {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll(selector);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const el of Array.from(nodes)) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    // A non-zero size alone isn't "visible": a closed offcanvas panel keeps
    // its full layout box while translated off-screen (e.g. left: -280px),
    // which would otherwise read as a valid match before it's actually
    // opened. Reject anything with no on-screen overlap.
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= vw || rect.top >= vh) continue;
    return el;
  }
  return null;
}
