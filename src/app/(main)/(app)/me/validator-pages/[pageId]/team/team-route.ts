/**
 * Route params shared by the team screen and the permissions page.
 */

/**
 * A positive whole number from a route or query param, else null: no
 * sign, decimal point, exponent, leading zero or spaces, and only one
 * value when a query key repeats.
 */
export function positiveId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
