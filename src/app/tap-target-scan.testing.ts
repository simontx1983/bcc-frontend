/**
 * The tap-target source scan shared by the 44px tests (F-440, F-317).
 *
 * jsdom does no layout, so a rendered test cannot measure a tap target and
 * Tailwind classes are only strings until build time. These tests read the
 * source instead: every interactive opening tag they cover must carry one
 * of the two 44px mechanisms in MECHANISM. Test-only: imported by
 * *.test.ts(x) files, never by shipped code (same convention as
 * source-tree.testing.ts).
 *
 * Lifted out of f440-tap-targets.test.ts unchanged, so the F-317 scan
 * reuses it instead of keeping a second copy (§11).
 */

/**
 * The opening tag starting at `start` ("<button …>"), up to the first `>`
 * outside any `{…}`, string, template literal or comment. A plain regex
 * stops at the `>` of `onClick={() => …}`, and the JSX comments in these
 * tags contain apostrophes.
 */
export function openTagAt(src: string, start: number): string {
  const stack: string[] = [];
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (top === '"' || top === "'") {
      if (c === top) stack.pop();
      continue;
    }
    if (top === "`") {
      if (c === "`") stack.pop();
      else if (c === "$" && src[i + 1] === "{") {
        stack.push("{");
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") stack.push(c);
    else if (c === "{") stack.push("{");
    else if (c === "}") stack.pop();
    else if (c === ">" && stack.length === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated tag at ${start}`);
}

/** Every `<tag …>` opening tag in `src`, in source order. */
export function openTags(src: string, tag: "button" | "select" | "input" | "Link"): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[\\s>]`, "g");
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const t = openTagAt(src, m.index);
    // A bare `<select>` is prose in a comment ("not a native <select>");
    // every real control here carries attributes (type=, onChange=, …).
    if (t !== `<${tag}>`) out.push(t);
  }
  return out;
}

/**
 * The two 44px mechanisms —
 *   - a real 44px box: `min-h-[44px]`, `min-h-11` or `h-11`, or
 *   - HIT_AREA_44 (feed/hitArea.ts): an invisible 44×44 ::before, for small
 *     controls whose look must not change.
 */
export const MECHANISM = /min-h-\[44px\]|\bmin-h-11\b|\bh-11\b|\bHIT_AREA_44\b/;

/** The tag's own classes, with `className={someConst}` resolved. */
export function classesOf(tag: string, src: string): string {
  const ident = /className=\{(\w+)\}/.exec(tag)?.[1];
  if (ident === undefined) return tag;
  const def = new RegExp(`const ${ident} =\\s*"([^"]*)"`).exec(src);
  if (def === null) throw new Error(`className constant ${ident} not found`);
  return `${tag} ${def[1]}`;
}
