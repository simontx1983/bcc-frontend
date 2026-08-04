"use client";

/**
 * PasswordStrengthMeter — lightweight, dependency-free strength heuristic
 * for the signup and reset-password new-password fields.
 *
 * Not a substitute for the server's own `bcc_weak_password` check (still
 * authoritative, still just an 8-char minimum) — this is purely a live
 * hint so a user isn't surprised by that error after submitting.
 */

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

const LABELS: Record<PasswordStrength, string> = {
  0: "Too short",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

const COLORS: Record<PasswordStrength, string> = {
  0: "var(--bcc-danger)",
  1: "var(--bcc-danger)",
  2: "var(--bcc-warning)",
  3: "var(--bcc-accent)",
  4: "var(--bcc-success)",
};

export function scorePasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return 0;
  let points = 1; // meets the 8-char minimum
  if (password.length >= 12) points++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^A-Za-z0-9]/.test(password)) points++;
  return Math.min(points, 4) as PasswordStrength;
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (password === "") return null;
  const score = scorePasswordStrength(password);
  const color = COLORS[score];

  return (
    <div style={{ marginTop: 6 }} aria-hidden={false}>
      <div style={{ display: "flex", gap: 4 }} role="presentation">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              height: 3,
              flex: 1,
              borderRadius: 2,
              background: i < score ? color : "var(--bcc-border)",
              transition: "background 150ms ease",
            }}
          />
        ))}
      </div>
      <span
        className="bcc-auth-hint"
        style={{ color, marginTop: 3, display: "block" }}
        aria-live="polite"
      >
        {LABELS[score]}
      </span>
    </div>
  );
}
