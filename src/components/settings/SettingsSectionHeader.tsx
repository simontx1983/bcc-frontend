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
  headingId,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  /**
   * Gives the heading an id and makes it a programmatic focus target
   * (tabIndex -1, never in the tab order): a section can land focus here
   * when the control that held it goes away (BlocksList, last unblock).
   */
  headingId?: string;
}) {
  return (
    <div className="border-l-2 border-bcc-accent pl-4">
      {/* Eyebrow on --bcc-text: accent as TEXT is ~2.4:1 on light
          surfaces (chrome-contrast shape 2); the accent stays on the rule. */}
      <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text">
        {eyebrow}
      </span>
      <h2
        id={headingId}
        tabIndex={headingId === undefined ? undefined : -1}
        className="bcc-stencil mt-1 text-2xl text-bcc-text md:text-3xl"
      >
        {title}
      </h2>
      <p className="bcc-mono mt-2 text-[11px] tracking-[0.14em] text-bcc-text-secondary">
        {blurb}
      </p>
    </div>
  );
}
