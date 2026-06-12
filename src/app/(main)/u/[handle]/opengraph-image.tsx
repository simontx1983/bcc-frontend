/**
 * /u/[handle]/opengraph-image — dynamically-generated branded OG card.
 *
 * App-Router file convention: a default async function returning an
 * `ImageResponse` (next/og) auto-wires this route as the profile's
 * `og:image` AND `twitter:image` (paired twitter-image.tsx re-exports
 * this module). The manual `openGraph.images` / `twitter.images` entries
 * in page.tsx's generateMetadata were removed so the head carries
 * exactly one image, pointing here.
 *
 * Why a rendered card and not the avatar: most operators have no uploaded
 * photo — the app falls back to an SVG initials monogram, which social
 * crawlers cannot render as a card. This route ALWAYS emits a raster PNG.
 *
 * §A2 compliance: every value rendered (display name, handle, tier_label,
 * rank_label, monogram_color, initials, reputation_score) is a
 * server-provided presentation field read verbatim. No client-side trust
 * math, no tier→color mapping — `card.crest.monogram_color` is the
 * server's resolved tier color. The only client-side derivations are the
 * shared presentation formatters (`presentationName`, `deriveInitials`),
 * the same §A2-exempt class as date formatters.
 *
 * Always returns a valid image: a `getUser` failure (404 or transient)
 * falls through to a generic branded "THE FLOOR" card rather than
 * throwing — a throw here would 500 the social-preview fetch.
 *
 * Runtime: Node (default). next/og's ImageResponse runs fine on the
 * Node runtime; we fetch font binaries with a bounded timeout and fall
 * back to ImageResponse's built-in font if that fetch fails, so the
 * route never blocks on font CDN availability.
 */

import { ImageResponse } from "next/og";

import { getUser } from "@/lib/api/user-endpoints";
import { deriveInitials } from "@/lib/format/initials";
import { presentationName } from "@/lib/format";

// OG standard canvas. Exported so Next emits the og:image:width/height
// tags and the route advertises the right content type.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Blue Collar Crypto operator file";

interface OgImageProps {
  params: Promise<{ handle: string }>;
}

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
    const match = css.match(
      /src:\s*url\(([^)]+)\)\s*format\('truetype'\)/,
    );
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

export default async function OpengraphImage({ params }: OgImageProps) {
  const { handle } = await params;

  // Load brand fonts in parallel; each independently degrades to null.
  // The `fonts` array we pass to ImageResponse only includes the ones
  // that actually resolved, so a CDN hiccup downgrades typography rather
  // than breaking the render.
  const [stencilData, monoData] = await Promise.all([
    loadFont(STENCIL_QUERY),
    loadFont(MONO_QUERY),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
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

  // Fall back to the built-in font when a brand font failed to load, so
  // every text node still renders with a sane family.
  const headlineFamily = stencilData !== null ? FONT_STENCIL : "sans-serif";
  const monoFamily = monoData !== null ? FONT_MONO : "monospace";

  const imageOptions = {
    ...size,
    ...(fonts.length > 0 ? { fonts } : {}),
  };

  // Anonymous read — exactly what a social crawler sees (§3.1 public
  // view-model). A null token is valid; metadata generation has no
  // session anyway. Any failure → generic branded card.
  let profile;
  try {
    profile = await getUser(handle, null);
  } catch {
    return new ImageResponse(
      <GenericCard monoFamily={monoFamily} headlineFamily={headlineFamily} />,
      imageOptions,
    );
  }

  const name = presentationName(profile);
  const showHandle = !profile.handle.includes("@");
  // Server-provided crest fields read verbatim (§A2). Initials fall back
  // to the shared deriveInitials helper if the server crest is empty.
  const crest = profile.card.crest;
  const initials =
    crest.initials.trim() !== ""
      ? crest.initials
      : deriveInitials(profile.display_name, profile.handle) || "??";
  const monogramColor = crest.monogram_color;

  const tierLabel = (profile.tier_label ?? "").trim();
  const rankLabel = profile.rank_label.trim();
  const reputation = profile.reputation_score ?? profile.trust_score;

  // Tagline: prefer the tier descriptor, fall back to a generic line.
  const tagline =
    tierLabel !== ""
      ? `${tierLabel} · ON THE FLOOR`
      : "OPERATOR ON THE FLOOR";

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
            <span>{"//"} OPERATOR FILE</span>
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
                background: monogramColor,
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
                color: monogramColor,
                fontFamily: headlineFamily,
                textTransform: "uppercase",
              }}
            >
              {initials}
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
              {name}
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
                @{profile.handle}
              </div>
            )}

            {/* Chip row — tier + rank, server-provided labels. */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                marginTop: 32,
              }}
            >
              {tierLabel !== "" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: `2px solid ${monogramColor}`,
                    color: monogramColor,
                    padding: "8px 18px",
                    fontSize: 24,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontFamily: monoFamily,
                  }}
                >
                  {tierLabel}
                </div>
              )}
              {rankLabel !== "" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: `2px solid ${EDGE}`,
                    color: INK_HI,
                    padding: "8px 18px",
                    fontSize: 24,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontFamily: monoFamily,
                  }}
                >
                  {rankLabel}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: `2px solid ${EDGE}`,
                  color: INK_HI,
                  padding: "8px 18px",
                  fontSize: 24,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontFamily: monoFamily,
                }}
              >
                REP {reputation}
              </div>
            </div>
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
          <span>{tagline}</span>
        </div>
      </div>
    ),
    imageOptions,
  );
}

/**
 * Generic branded fallback — rendered when the profile can't be fetched
 * (404 / transient). No per-user data; just the wordmark + "THE FLOOR".
 */
function GenericCard({
  headlineFamily,
  monoFamily,
}: {
  headlineFamily: string;
  monoFamily: string;
}) {
  return (
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
          style={{ width: 14, height: 14, borderRadius: 999, background: ACCENT }}
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
  );
}
