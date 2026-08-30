// Entry B — the CONTROL, and it is not optional.
//
// It imports the root entry and touches the commune surface, so the sentinels
// MUST be present in its bundle. Without this, a build that emitted two empty
// files would satisfy entry A's "sentinels absent" assertion perfectly, and the
// proof would prove nothing at all.
import { getCommune, getWilayas, search } from "algeria-wilayas-communes";

document.body.textContent = [
  String(getWilayas().length),
  getCommune("19-ain-azel-ain-lahdjar")?.name.fr ?? "?",
  String(search("ain").length),
].join(" ");
