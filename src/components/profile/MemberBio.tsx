/**
 * MemberBio — paper-sheet bio block with editorial body type and a
 * handwritten signature foot.
 *
 * Aesthetic notes:
 *   - bcc-paper supplies the warm cardstock surface + multiply noise
 *   - First paragraph drops without indent (editorial convention)
 *   - Subsequent paragraphs are indented 1em (the prototype's choice;
 *     it gives the block a "letter from the foreman" feel)
 *   - The signature row uses Homemade Apple cursive over a verified
 *     phosphor-tinted sub-line (rank · streak · reviews on file)
 *
 * Server controls editability via `bio.is_editable` — render the Edit
 * affordance only when true. The Edit button is a Link to
 * /settings/identity; the page-vs-modal decision is settled.
 */

import Link from "next/link";
import type { Route } from "next";

import type { Phase4MemberProfile } from "@/lib/api/types";

// The live MemberProfile contract returns `bio` as a plain string per
// §3.1; the richer paragraph + signature shape lives in `bio_block`,
// composed server-side per §A2. Rich consumers (this component) take
// the `bio_block` shape; the simple profile page renders `bio` directly.
interface MemberBioProps {
  bio: Phase4MemberProfile["bio_block"];
  signature: string;
}

export function MemberBio({ bio, signature }: MemberBioProps) {
  return (
    <article
      className="bcc-paper bcc-stage-reveal"
      style={{ padding: "36px 44px", ["--stagger" as string]: "320ms" }}
    >
      {/* Kicker rule — orange caption with a fading dash that flexes
          to the end of the row (visual "ledger entry" cue). */}
      <div
        className="bcc-mono mb-3 flex items-center gap-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        <span>FROM THE OPERATOR</span>
        <span aria-hidden className="h-px flex-1 bg-safety/40" />
      </div>

      {/* Bio body — paragraphs styled like editorial copy. */}
      <div className="font-serif text-ink" style={{ fontSize: "17px", lineHeight: 1.58, maxWidth: "780px" }}>
        {bio.paragraphs.map((p, i) => (
          <p key={i} style={{ marginTop: i === 0 ? 0 : "12px", textIndent: i === 0 ? 0 : "1em" }}>
            {p}
          </p>
        ))}
      </div>

      {/* Foot — handwritten signature + verified pedigree line + edit btn */}
      <footer
        className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-dashed border-ink/25 pt-4"
      >
        <div className="flex items-center gap-4">
          <span className="bcc-script text-ink" style={{ fontSize: "26px", lineHeight: 1 }}>
            ~ {signature}
          </span>
          <span
            className="bcc-mono text-ink-ghost"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            <strong className="text-verified" style={{ fontWeight: 700 }}>
              ✓ {bio.signature_line.split("·")[0]?.trim().toUpperCase() ?? "VERIFIED"}
            </strong>
            {bio.signature_line.includes("·") && (
              <>
                {" · "}
                {bio.signature_line.split("·").slice(1).join("·").trim().toUpperCase()}
              </>
            )}
          </span>
        </div>

        {bio.is_editable && (
          <Link
            href={"/settings/identity" as Route}
            className="bg-cardstock-deep text-ink hover:bg-weld border-2 border-ink inline-block"
            style={{
              padding: "6px 12px",
              fontFamily: "var(--font-mono), monospace",
              fontSize: "10px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Edit Bio
          </Link>
        )}
      </footer>
    </article>
  );
}
