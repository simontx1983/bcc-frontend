/**
 * person-jsonld.ts — the ProfilePage → Person graph for /u/[handle].
 *
 * The app's first structured data. Kept deliberately small: a valid graph
 * with four honest fields beats an impressive-looking one that misrepresents
 * the product.
 *
 * ## What is deliberately NOT here
 *
 * No `aggregateRating`. BCC's trust score, vouches, backings and rank are not
 * product ratings — mapping them would tell Google this person has a 4.2-star
 * review average, which is false. `aggregateRating` on a Person is invalid
 * markup besides.
 *
 * No `interactionStatistic` either. Reviews written, vouches and backings have
 * no honest counterpart in Schema.org's InteractionCounter vocabulary, and an
 * approximate mapping is still a wrong one.
 *
 * No custom BCC properties inside the Schema.org objects. A vocabulary is only
 * useful if consumers can trust it means what it says.
 *
 * ## Stable @ids
 *
 * Both nodes are addressable off the canonical URL, so a consumer can
 * de-duplicate the Person across pages that reference it.
 */

/** Minimal shape this builder needs. Structural, so it never drifts from types.ts. */
export interface PersonGraphInput {
  /** Public display name. */
  name: string;
  /** Public handle, emitted as alternateName. */
  handle: string;
  /** Plain-text public bio. Empty string means "absent". */
  bio: string;
  /** Absolute canonical profile URL. */
  canonicalUrl: string;
  /** Absolute public avatar URL, when one exists. */
  imageUrl?: string | undefined;
}

/**
 * Build the graph. Absent fields are OMITTED — never emitted as "" or null,
 * which would be worse than saying nothing.
 */
export function buildPersonGraph(input: PersonGraphInput): Record<string, unknown> {
  const person: Record<string, unknown> = {
    "@type": "Person",
    "@id": `${input.canonicalUrl}#person`,
    name: input.name,
    url: input.canonicalUrl,
  };

  const handle = input.handle.trim();
  if (handle !== "") {
    person["alternateName"] = handle;
  }

  const bio = input.bio.trim();
  if (bio !== "") {
    person["description"] = bio;
  }

  if (input.imageUrl !== undefined && input.imageUrl !== "") {
    person["image"] = input.imageUrl;
  }

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${input.canonicalUrl}#profilepage`,
    url: input.canonicalUrl,
    mainEntity: person,
  };
}

/**
 * Serialize for embedding in a <script type="application/ld+json"> block.
 *
 * The payload carries user-controlled text (display name, bio), so the output
 * must not be able to close the script element or break the HTML parser.
 *
 * JSON.stringify alone is NOT enough — it happily emits a literal `</script>`
 * from inside a string. Each replacement below swaps the character for its
 * JSON `\uXXXX` escape, which is a valid JSON string escape: the text still
 * parses back to the identical character, but no literal `<`, `>` or `&`
 * survives in the HTML byte stream, so `</script>` cannot form.
 *
 * U+2028 and U+2029 are valid in JSON strings but are line terminators in
 * older JavaScript parsers, which would break a script block that contained
 * them raw. Escaped for the same reason.
 *
 * Everything else — quotes, emoji, other Unicode — is already handled
 * correctly by JSON.stringify and passes through intact.
 */
const SCRIPT_UNSAFE = /[<>&\u2028\u2029]/g;

// The values below must be the six-character TEXT (backslash, u, 0, 0, 3, c),
// NOT the character that sequence denotes. Written as an ordinary string
// literal the backslash count IS the bug: one backslash makes the value the
// character itself, so the replace is a silent no-op and a literal
// closing script tag survives into the HTML. Building the backslash from its
// char code removes the ambiguity, and keeps this file free of the escape
// sequences that editors and codemods most like to rewrite.
const BS = String.fromCharCode(92);

/** U+2028 / U+2029 as real characters — the keys must be what we match. */
const LINE_SEP      = String.fromCharCode(0x2028);
const PARAGRAPH_SEP = String.fromCharCode(0x2029);

const SCRIPT_ESCAPES: Readonly<Record<string, string>> = {
  "<": BS + "u003c",
  ">": BS + "u003e",
  "&": BS + "u0026",
  [LINE_SEP]: BS + "u2028",
  [PARAGRAPH_SEP]: BS + "u2029",
};

export function serializeJsonLd(graph: Record<string, unknown>): string {
  return JSON.stringify(graph).replace(
    SCRIPT_UNSAFE,
    (ch) => SCRIPT_ESCAPES[ch] ?? ch,
  );
}
