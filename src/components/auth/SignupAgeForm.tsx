"use client";

import { useId, useState, type FormEvent } from "react";

import { checkSignupAge } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";

export function SignupAgeForm({ onEligible }: { onEligible: (token: string) => void }) {
  const dateId = useId();
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || date === "") return;
    setPending(true);
    setError(null);
    setDate("");
    try {
      const { eligibility_token } = await checkSignupAge(date);
      onEligible(eligibility_token);
    } catch (cause) {
      const code = cause instanceof BccApiError ? cause.code : null;
      if (code === "age_ineligible") {
        setRefused(true);
        return;
      }
      setError(code === "bcc_invalid_request"
        ? "Enter a valid date of birth."
        : "The age check is unavailable. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (refused) {
    return <p className="bcc-auth-error" role="alert">You’re not eligible to create an account.</p>;
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => { void submit(event); }}>
      <div className="bcc-auth-field">
        <label className="bcc-auth-label" htmlFor={dateId}>Date of birth</label>
        <input
          id={dateId}
          className="bcc-auth-input"
          type="date"
          autoComplete="off"
          required
          disabled={pending}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <p className="bcc-auth-hint">We use this date to check eligibility and don’t save it.</p>
      </div>
      {error !== null && <p className="bcc-auth-error" role="alert">{error}</p>}
      <button type="submit" className="bcc-auth-submit" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
