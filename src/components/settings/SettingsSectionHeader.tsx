/**
 * SettingsSectionHeader — visual section divider used by every editor
 * surface (profile fields, privacy, account, …). Blueprint accent line +
 * eyebrow label + title + blurb. Pure presentation, no client state.
 *
 * Lives in components/ rather than under the settings route group so it
 * survives the settings-into-profile migration: the owner tabs on
 * /u/[handle] use it too, and `src/app/settings/**` is being retired.
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
