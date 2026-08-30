/**
 * A five-digit Algerian postal code, e.g. `"16005"`.
 *
 * Deliberately a *branded string*, not the template-literal type
 * `` `${number}${number}${number}${number}${number}` ``. That form is wrong in
 * both directions on this dataset: `${number}` accepts `"1e5"`, `"-1"` and
 * `"1.5"`, while TypeScript rejects a leading zero — so it would refuse every
 * real code in wilaya 05 (Batna), all of which start with `0`.
 *
 * The `isPostalCode` guard that mints this type ships with the rest of the
 * runtime API in session 2. The type lands here because the generated commune
 * records already need `PostalCode | null` in their signature.
 */
export type PostalCode = string & { readonly __brand: "PostalCode" };
