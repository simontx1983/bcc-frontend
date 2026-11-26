import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignupAgeForm } from "@/components/auth/SignupAgeForm";
import { checkSignupAge } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";

vi.mock("@/lib/api/auth-endpoints", () => ({ checkSignupAge: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function answer(value: string) {
  const input = screen.getByLabelText("Date of birth");
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  return input;
}

describe("signup age check", () => {
  it("passes only the backend proof to the next step and clears the date", async () => {
    const next = vi.fn();
    vi.mocked(checkSignupAge).mockResolvedValue({ eligibility_token: "opaque-proof" });
    render(<SignupAgeForm onEligible={next} />);
    const input = answer("2000-01-01");
    expect(input).toHaveValue("");
    expect(checkSignupAge).toHaveBeenCalledWith("2000-01-01");
    await waitFor(() => expect(next).toHaveBeenCalledWith("opaque-proof"));
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("stops a refusal without offering another answer in the same screen", async () => {
    const next = vi.fn();
    vi.mocked(checkSignupAge).mockRejectedValue(
      new BccApiError("age_ineligible", "internal detail", 403, null),
    );
    render(<SignupAgeForm onEligible={next} />);
    answer("2020-01-01");
    expect(await screen.findByRole("alert")).toHaveTextContent("not eligible");
    expect(screen.queryByLabelText("Date of birth")).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("reports an invalid date and lets the visitor enter a corrected one", async () => {
    vi.mocked(checkSignupAge).mockRejectedValue(
      new BccApiError("bcc_invalid_request", "internal detail", 400, null),
    );
    render(<SignupAgeForm onEligible={vi.fn()} />);
    answer("2999-01-01");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid date of birth.");
    expect(screen.getByLabelText("Date of birth")).toHaveValue("");
  });
});
