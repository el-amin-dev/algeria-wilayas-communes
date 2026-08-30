// Entry A — the claim under test.
//
// A real consumer's smallest realistic use of this library: render the wilaya
// count. Nothing here mentions a daira or a commune, so nothing about a daira or
// a commune may survive into the bundle.
import { getWilayas } from "algeria-wilayas-communes/wilayas";

document.body.textContent = String(getWilayas().length);
