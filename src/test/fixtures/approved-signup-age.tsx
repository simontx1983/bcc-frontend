import { useEffect } from "react";

/** For tests exercising flows that start after the age check. */
export function SignupAgeForm({ onEligible }: { onEligible: (token: string) => void }) {
  useEffect(() => onEligible("test-eligibility-proof"), [onEligible]);
  return null;
}
