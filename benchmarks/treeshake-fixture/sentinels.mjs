/**
 * Commune-only sentinel strings, **derived from the dataset, never hardcoded.**
 *
 * ── Why derivation is not fussiness ─────────────────────────────────────────
 *
 * The session-4 spec proposes three literal sentinels: `Alger Centre`,
 * `Sidi Ameur` and `Souk El Had`. Two of them are fine. **`Sidi Ameur` is also a
 * daïra name**, so the half of the assertion that says "these strings are absent
 * from `dist/dairas.mjs`" would have failed against a completely correct build —
 * and the natural reaction to a sentinel test failing on correct data is to
 * weaken the test.
 *
 * So the list is computed: a sentinel is a commune `nom_fr` that appears nowhere
 * in `data/wilayas.json` or `data/dairas.json`, **as a substring of the raw file
 * text** rather than merely as a distinct name value. The substring form is the
 * one the byte assertion actually needs, since it greps a bundle rather than
 * comparing structured fields.
 *
 * Every sentinel is verified on load. If a future dataset makes one of them a
 * daïra name, this module throws at import with a message naming the string,
 * instead of the tree-shaking proof quietly starting to fail.
 *
 * ── The canonical row is pinned deliberately ────────────────────────────────
 *
 * `Ain Lahdjar` and `19-ain-azel-ain-lahdjar` are ADR-006's canonical commune.
 * Pinning them means the proof reads against the same row as every JSDoc example
 * in the library, and a reader who has seen one has seen the other. The third
 * sentinel is picked from the derived pool by a stable rule so the list does not
 * churn between runs.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DATA = new URL("../../data/", import.meta.url);

const read = (name) => readFileSync(fileURLToPath(new URL(name, DATA)), "utf8");

const wilayasText = read("wilayas.json");
const dairasText = read("dairas.json");
const communes = JSON.parse(read("communes.json")).communes;

/** True when `value` occurs nowhere in the wilaya or daïra files. */
const communeOnly = (value) => !wilayasText.includes(value) && !dairasText.includes(value);

/**
 * ADR-006's canonical commune, pinned by id and by French name.
 *
 * The id is commune-only by construction — a commune id has three
 * `<wilaya>-<daira>-<commune>` segments where a daïra id has two — but it is
 * still put through the same check, because "by construction" is exactly the
 * kind of claim that stops being true quietly.
 */
const PINNED = ["19-ain-azel-ain-lahdjar", "Ain Lahdjar"];

/**
 * One more, chosen by a stable rule rather than by taste: the longest
 * commune-only French name, ties broken alphabetically. Length matters because a
 * short name is more likely to occur incidentally inside some unrelated string,
 * which would make a leak report a false positive.
 */
const derived = [...new Set(communes.map((c) => c.nom_fr))]
  .filter(communeOnly)
  .sort((a, b) => b.length - a.length || a.localeCompare(b))[0];

export const COMMUNE_ONLY_SENTINELS = [...PINNED, derived];

/**
 * Strings that MUST be present in any bundle carrying real wilaya data.
 *
 * These make the wilaya-side assertion two-sided. Checking only that commune
 * names are absent, under only an upper size bound, is satisfied perfectly by a
 * bundle containing nothing at all -- which is exactly the failure mode a
 * refactor would produce (an accidentally-empty memo, or a bad `external` in a
 * tsup upgrade emitting a stub). ADR-006's canonical wilaya, in both scripts,
 * because a build that dropped the Arabic names while keeping the French ones is
 * a real and otherwise invisible regression.
 */
export const WILAYA_PRESENT_SENTINELS = ["Setif", "سطيف"];

const wilayas = JSON.parse(wilayasText).wilayas;
for (const sentinel of WILAYA_PRESENT_SENTINELS) {
  if (!wilayas.some((w) => w.nom_fr === sentinel || w.nom_ar === sentinel)) {
    throw new Error(
      `"${sentinel}" is not a wilaya name in data/wilayas.json, so asserting its ` +
        "presence would prove nothing. Pick a real one.",
    );
  }
}

for (const sentinel of COMMUNE_ONLY_SENTINELS) {
  if (sentinel === undefined) {
    throw new Error("No commune-only name could be derived — data/communes.json looks wrong.");
  }
  if (!communeOnly(sentinel)) {
    throw new Error(
      `Sentinel "${sentinel}" is no longer commune-only: it now appears in ` +
        `data/wilayas.json or data/dairas.json. Pick a different one — do not ` +
        `weaken the assertion that uses it.`,
    );
  }
}
