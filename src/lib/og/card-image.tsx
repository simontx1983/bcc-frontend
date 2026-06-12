/**
 * Shared OG-card renderer for the branded 1200×630 "operator file" PNG.
 *
 * ONE source of truth for the next/og ImageResponse card used by BOTH:
 *   - the member profile  (/u/[handle]/opengraph-image.tsx)
 *   - the three entity     (/v, /p, /c/[slug]/opengraph-image.tsx) routes
 *
 * The member and entity cards share the same visual identity (dark
 * #0d1117 surface, safety-orange operator-file rail, tier-colored hex
 * crest + stencil monogram, static-font loader). They differ only in the
 * data each surfaces — captured by the `OgCardData` shape below — so this
 * module renders from a normalized prop bag and each route maps its own
 * view-model (MemberProfile vs Card) into it.
 *
 * Font loading is intentionally STATIC (single explicit weight via the
 * css2 API with a desktop UA → TrueType): Satori, the engine behind
 * ImageResponse, CRASHES on variable fonts. Do not "simplify" loadFont to
 * request a variable axis.
 *
 * §A2 compliance: every value rendered (name, handle, tier label, rank
 * label, monogram color, initials, reputation/trust score, kind label,
 * status/chain chip) is a server-provided presentation field passed in
 * verbatim by the caller. This module performs NO trust math and NO
 * tier→color mapping — `monogramColor` is the server's resolved color.
 *
 * Never throws: callers wrap their fetch in try/catch and fall back to
 * `GenericCard`; this module's render path itself has no fetch.
 */

import { ImageResponse } from "next/og";

// ── Brand palette (mirrors globals.css design tokens) ──────────────────
// ImageResponse renders in isolation — it cannot read CSS custom
// properties — so the brand hexes are inlined here. These match the
// app's dark surface (#0d1117), accent blue, and safety orange.
const BG = "#0d1117";
const BG_PANEL = "#161b22";
const EDGE = "#30363d";
const INK_HI = "#e6edf3";
const INK_MUTED = "#8b949e";
const ACCENT = "#16b5e6"; // --bcc-primary
const SAFETY = "#f98a1c"; // --bcc-secondary (safety orange)

const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

// OG standard canvas. Re-exported by every route's image module so Next
// emits the og:image:width/height tags and the right content type.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * Resolve a STATIC TrueType instance of a Google font and return its
 * binary, bounded by a timeout. Returns null on ANY failure (network,
 * timeout, non-200, unparseable CSS) so the caller can fall back to the
 * built-in font rather than failing the whole image.
 *
 * Two-hop resolution:
 *   1. GET the css2 API with a desktop User-Agent. The UA matters — the
 *      API returns woff2 to modern browsers but TrueType to older/desktop
 *      agents, and Satori (the engine behind ImageResponse) only accepts
 *      static TTF/OTF. We request a single explicit weight so the file is
 *      a static instance, NOT a variable font (Satori crashes on variable
 *      fonts — `Cannot read properties of undefined`).
 *   2. Fetch the `url(...) format('truetype')` the CSS points at.
 *
 * The family/weight is passed as a css2 query fragment (e.g.
 * "Big+Shoulders+Stencil:wght@700").
 */
async function loadFont(familyQuery: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?family=${familyQuery}&display=swap`,
      {
        signal: controller.signal,
        // Desktop UA → TrueType (not woff2), which Satori can parse.
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      },
    );
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/);
    if (match === null || match[1] === undefined) return null;
    const fontRes = await fetch(match[1], { signal: controller.signal });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// css2 family fragments for the brand families loaded via next/font in
// layout.tsx. Single explicit weights → static instances. 700 stencil for
// headlines, 500 mono for the technical rail copy.
const STENCIL_QUERY = "Big+Shoulders+Stencil:wght@700";
const MONO_QUERY = "JetBrains+Mono:wght@500";

/** Brand-font family names used in the JSX `style` props. */
const FONT_STENCIL = "Big Shoulders Stencil";
const FONT_MONO = "JetBrains Mono";

type ImageFonts = NonNullable<
  ConstructorParameters<typeof ImageResponse>[1]
>["fonts"];

interface ResolvedFonts {
  /** Fonts array to hand to ImageResponse (only the ones that loaded). */
  fonts: ImageFonts;
  /** Family name for headline text (falls back to "sans-serif"). */
  headlineFamily: string;
  /** Family name for mono/rail text (falls back to "monospace"). */
  monoFamily: string;
}

/**
 * Load the brand fonts in parallel; each independently degrades to null.
 * Returns the family names to use in `style` props plus the `fonts` array
 * (only the ones that resolved) so a CDN hiccup downgrades typography
 * rather than breaking the render. Call once per request and thread the
 * result into both the card and the fallback.
 */
export async function loadBrandFonts(): Promise<ResolvedFonts> {
  const [stencilData, monoData] = await Promise.all([
    loadFont(STENCIL_QUERY),
    loadFont(MONO_QUERY),
  ]);

  const fonts: NonNullable<ImageFonts> = [];
  if (stencilData !== null) {
    fonts.push({
      name: FONT_STENCIL,
      data: stencilData,
      weight: 700,
      style: "normal",
    });
  }
  if (monoData !== null) {
    fonts.push({
      name: FONT_MONO,
      data: monoData,
      weight: 500,
      style: "normal",
    });
  }

  return {
    fonts,
    headlineFamily: stencilData !== null ? FONT_STENCIL : "sans-serif",
    monoFamily: monoData !== null ? FONT_MONO : "monospace",
  };
}

/** Build the ImageResponse options (size + fonts) from resolved fonts. */
export function imageOptions(resolved: ResolvedFonts) {
  return {
    ...OG_SIZE,
    ...(resolved.fonts !== undefined && resolved.fonts.length > 0
      ? { fonts: resolved.fonts }
      : {}),
  };
}

/**
 * Normalized data the card renders. Every field is server-provided
 * presentation, mapped in by the caller — this module never derives any
 * of it.
 */
export interface OgCardData {
  /**
   * Rail kind label shown top-left after the wordmark (e.g. "OPERATOR
   * FILE", "VALIDATOR", "PROJECT", "CREATOR"). Already uppercase-ready.
   */
  railLabel: string;
  /** Big stencil display name. */
  name: string;
  /** Bare handle (no leading @). Empty string suppresses the @ line. */
  handle: string;
  /** Tier-resolved crest color (server-provided `monogram_color`). */
  monogramColor: string;
  /** 1–2 char monogram for the hex crest. */
  initials: string;
  /**
   * Chips rendered under the handle (tier label, rank label, REP score,
   * validator status/chain …). Each is { text, accent }: accent=true
   * borders/colors the chip in the tier color, accent=false uses the
   * neutral edge. Caller orders + filters them; empty array → no chips.
   */
  chips: Array<{ text: string; accent: boolean }>;
  /** Bottom rail tagline (already uppercase-ready). */
  tagline: string;
}

/**
 * Render the branded operator-file card to an ImageResponse. Both the
 * member route and the entity routes call this with their normalized
 * data + the shared resolved fonts.
 */
export function renderOgCard(
  data: OgCardData,
  resolved: ResolvedFonts,
): ImageResponse {
  const { headlineFamily, monoFamily } = resolved;
  const showHandle = data.handle !== "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          // Subtle accent glow top-left + safety glow bottom-right for the
          // "operator file under a work lamp" feel.
          backgroundImage: `radial-gradient(900px circle at 8% -10%, rgba(22,181,230,0.16), transparent 55%), radial-gradient(700px circle at 110% 120%, rgba(249,138,28,0.12), transparent 50%)`,
          padding: "64px 72px",
          position: "relative",
          fontFamily: monoFamily,
        }}
      >
        {/* Safety-orange accent edge down the left margin */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 12,
            background: SAFETY,
          }}
        />

        {/* Top rail — wordmark + file metadata, mirrors the FileRail. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: INK_MUTED,
            fontSize: 22,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontFamily: monoFamily,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: ACCENT,
              }}
            />
            <span style={{ color: INK_HI }}>BLUE COLLAR CRYPTO</span>
            <span>
              {"//"} {data.railLabel}
            </span>
          </div>
          <span>FILE 0001 {"//"} OPEN</span>
        </div>

        {/* Body — crest on the left, identity stack on the right. */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: 64,
            marginTop: 24,
          }}
        >
          {/* Tier-colored hex crest with stencil initials. */}
          <div
            style={{
              display: "flex",
              width: 320,
              height: 360,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {/* outer ring */}
            <div
              style={{
                position: "absolute",
                width: 320,
                height: 360,
                background: data.monogramColor,
                clipPath: HEX_CLIP,
                display: "flex",
              }}
            />
            {/* inner fill */}
            <div
              style={{
                position: "absolute",
                width: 296,
                height: 332,
                background: BG_PANEL,
                clipPath: HEX_CLIP,
                display: "flex",
              }}
            />
            <span
              style={{
                position: "relative",
                fontSize: 170,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: data.monogramColor,
                fontFamily: headlineFamily,
                textTransform: "uppercase",
              }}
            >
              {data.initials}
            </span>
          </div>

          {/* Identity stack. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 92,
                lineHeight: 1.0,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: INK_HI,
                fontFamily: headlineFamily,
                textTransform: "uppercase",
                // Clamp to two visual lines' worth of height via overflow.
                maxHeight: 200,
                overflow: "hidden",
              }}
            >
              {data.name}
            </div>

            {showHandle && (
              <div
                style={{
                  display: "flex",
                  marginTop: 18,
                  fontSize: 30,
                  letterSpacing: "0.12em",
                  color: SAFETY,
                  fontFamily: monoFamily,
                }}
              >
                @{data.handle}
              </div>
            )}

            {/* Chip row — caller-ordered server labels. */}
            {data.chips.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  marginTop: 32,
                }}
              >
                {data.chips.map((chip, i) => (
                  <div
                    key={`${chip.text}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      border: `2px solid ${chip.accent ? data.monogramColor : EDGE}`,
                      color: chip.accent ? data.monogramColor : INK_HI,
                      padding: "8px 18px",
                      fontSize: 24,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      fontFamily: monoFamily,
                    }}
                  >
                    {chip.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom tagline rail. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: INK_MUTED,
            fontSize: 24,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily: monoFamily,
          }}
        >
          <div style={{ width: 48, height: 2, background: SAFETY }} />
          <span>{data.tagline}</span>
        </div>
      </div>
    ),
    imageOptions(resolved),
  );
}

/**
 * Generic branded fallback — rendered when the subject can't be fetched
 * (404 / transient). No per-subject data; just the wordmark + "THE
 * FLOOR". Used by every route's catch branch so a fetch failure renders a
 * valid PNG rather than 500-ing the social-preview crawl.
 */
export function renderGenericCard(resolved: ResolvedFonts): ImageResponse {
  const { headlineFamily, monoFamily } = resolved;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: BG,
          backgroundImage: `radial-gradient(900px circle at 50% -20%, rgba(22,181,230,0.18), transparent 55%)`,
          padding: "72px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 12,
            background: SAFETY,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: INK_MUTED,
            fontSize: 24,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            fontFamily: monoFamily,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: ACCENT,
            }}
          />
          <span style={{ color: INK_HI }}>BLUE COLLAR CRYPTO</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 140,
            fontWeight: 700,
            lineHeight: 1.0,
            letterSpacing: "0.02em",
            color: INK_HI,
            fontFamily: headlineFamily,
            textTransform: "uppercase",
            marginTop: 24,
          }}
        >
          THE FLOOR
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 28,
            color: INK_MUTED,
            fontSize: 26,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontFamily: monoFamily,
          }}
        >
          <div style={{ width: 48, height: 2, background: SAFETY }} />
          <span>Trust · Identity · Reputation for crypto operators</span>
        </div>
      </div>
    ),
    imageOptions(resolved),
  );
}
