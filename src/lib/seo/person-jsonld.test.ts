/**
 * Person / ProfilePage graph — shape, omission, and script-injection safety.
 *
 * The payload carries user-controlled text (display name, bio) and is written
 * straight into a <script> block, so the escaping here is a security control,
 * not a formatting nicety. A serializer that no-ops leaves a live
 * `</script><img onerror=...>` in the page.
 */

import { describe, expect, it } from "vitest";

import { buildPersonGraph, serializeJsonLd } from "@/lib/seo/person-jsonld";

const BASE = {
  name: "Dana Reyes",
  handle: "dana",
  bio: "Runs a validator.",
  canonicalUrl: "https://bluecollarcrypto.io/u/dana",
};

const CLOSING_SCRIPT = `</${"script"}>`;
const LINE_SEP = String.fromCharCode(0x2028);
const PARAGRAPH_SEP = String.fromCharCode(0x2029);

describe("buildPersonGraph — shape", () => {
  it("nests Person under ProfilePage with stable @ids", () => {
    const g = buildPersonGraph(BASE);
    expect(g["@context"]).toBe("https://schema.org");
    expect(g["@type"]).toBe("ProfilePage");
    expect(g["@id"]).toBe(`${BASE.canonicalUrl}#profilepage`);

    const person = g["mainEntity"] as Record<string, unknown>;
    expect(person["@type"]).toBe("Person");
    expect(person["@id"]).toBe(`${BASE.canonicalUrl}#person`);
    expect(person["name"]).toBe("Dana Reyes");
    expect(person["alternateName"]).toBe("dana");
    expect(person["description"]).toBe("Runs a validator.");
    expect(person["url"]).toBe(BASE.canonicalUrl);
  });

  it("includes image only when present", () => {
    const without = buildPersonGraph(BASE)["mainEntity"] as Record<string, unknown>;
    expect(without).not.toHaveProperty("image");

    const withImg = buildPersonGraph({
      ...BASE,
      imageUrl: "https://cdn.example/a.png",
    })["mainEntity"] as Record<string, unknown>;
    expect(withImg["image"]).toBe("https://cdn.example/a.png");
  });

  it("OMITS empty fields rather than emitting empty strings", () => {
    const person = buildPersonGraph({
      ...BASE,
      bio: "   ",
      handle: "",
      imageUrl: "",
    })["mainEntity"] as Record<string, unknown>;

    expect(person).not.toHaveProperty("description");
    expect(person).not.toHaveProperty("alternateName");
    expect(person).not.toHaveProperty("image");
    // The fields that always exist are still there.
    expect(person["name"]).toBe("Dana Reyes");
  });

  it("carries no rating, trust, rank or invented interaction statistics", () => {
    const json = JSON.stringify(
      buildPersonGraph({ ...BASE, imageUrl: "https://cdn.example/a.png" }),
    );
    for (const banned of [
      "aggregateRating",
      "ratingValue",
      "reviewCount",
      "interactionStatistic",
      "InteractionCounter",
      "trust_score",
      "trustScore",
      "reputation",
      "rank",
      "vouch",
      "backing",
    ]) {
      expect(json, `graph leaked ${banned}`).not.toContain(banned);
    }
  });
});

describe("serializeJsonLd — script-injection safety", () => {
  const hostile = buildPersonGraph({
    ...BASE,
    name: `Bob ${CLOSING_SCRIPT}<img src=x onerror=alert(1)>`,
    bio: `a & b ${LINE_SEP} c ${PARAGRAPH_SEP} "quoted" 'single' 🔧 café`,
  });

  it("leaves no literal closing script tag", () => {
    expect(serializeJsonLd(hostile)).not.toContain(CLOSING_SCRIPT);
  });

  it("leaves no raw <, > or &", () => {
    const out = serializeJsonLd(hostile);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
  });

  it("leaves no raw U+2028 / U+2029", () => {
    // Valid inside a JSON string but line terminators to older JS parsers,
    // which would break the surrounding script block.
    const out = serializeJsonLd(hostile);
    expect(out).not.toContain(LINE_SEP);
    expect(out).not.toContain(PARAGRAPH_SEP);
  });

  it("still parses, and round-trips every value exactly", () => {
    const parsed = JSON.parse(serializeJsonLd(hostile)) as Record<string, unknown>;
    const person = parsed["mainEntity"] as Record<string, unknown>;

    expect(person["name"]).toBe(`Bob ${CLOSING_SCRIPT}<img src=x onerror=alert(1)>`);
    expect(person["description"]).toContain("a & b");
    expect(person["description"]).toContain(LINE_SEP);
    expect(person["description"]).toContain(PARAGRAPH_SEP);
    expect(person["description"]).toContain('"quoted"');
    expect(person["description"]).toContain("🔧");
    expect(person["description"]).toContain("café");
  });

  it("does not mangle an ordinary payload", () => {
    const out = serializeJsonLd(buildPersonGraph(BASE));
    expect(JSON.parse(out)).toEqual(buildPersonGraph(BASE));
  });
});
