/**
 * SettingsSectionHeader — visual section divider used inside settings
 * pages (Profile, Privacy, Account). Blueprint accent line + eyebrow
 * label + title + blurb. Pure presentation, no client state.
 *
 * Lives under settings/_components so Next.js doesn't treat it as a
 * route segment (the underscore prefix marks it private).
 */

export function SettingsSectionHeader({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="border-l-2 border-blueprint pl-4">
      <span className="bcc-mono text-[10px] tracking-[0.24em] text-blueprint">
        {eyebrow}
      </span>
      <h2 className="bcc-stencil mt-1 text-2xl text-cardstock md:text-3xl">
        {title}
      </h2>
      <p className="bcc-mono mt-2 text-[11px] tracking-[0.14em] text-cardstock-deep">
        {blurb}
      </p>
    </div>
  );
}
