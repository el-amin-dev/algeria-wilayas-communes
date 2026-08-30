/**
 * FROZEN v1 FIXTURE — do not edit, do not lint, do not "modernize".
 *
 * This is `packages/js/index.js` as it shipped in v1.0.0 -- unmodified except
 * for the `DATA_DIR` path, annotated in place below -- taken from
 * `git show HEAD:packages/js/index.js` at the start of session 4 and kept here
 * because session 4 deletes the original from the package.
 *
 * It is the *only* thing that can produce the honest "before" column in
 * `benchmarks/results.json`. Reimplementing it, or benchmarking v2 against a
 * paraphrase of it, would make every comparison in the README unverifiable.
 *
 * It reads sibling JSON from `packages/js/data/`, which is gitignored and staged
 * by `benchmarks/stage-v1-data.mjs`. That is why the fixture lives here and not
 * next to the data: the path arithmetic below resolves `./data` relative to this
 * file, so the loader is pointed at the staged directory explicitly instead.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// v1 shipped as `packages/js/index.js`, so `./data` resolved to
// `packages/js/data`. This fixture sits two directories away; the target is
// unchanged, only the number of `..` hops. Nothing else in this file is touched.
const DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "packages",
  "js",
  "data",
);

const cache = new Map();
function load(file) {
  if (!cache.has(file)) {
    cache.set(file, JSON.parse(readFileSync(join(DATA_DIR, file), "utf-8")));
  }
  return cache.get(file);
}

/** Full nested tree: wilaya > daira > commune. */
export function getAll() {
  return load("algeria.json");
}

/** Flat array of the 69 wilayas. */
export function getWilayas() {
  return load("wilayas.json").wilayas;
}

/** Flat array of the 591 daïras (each with its wilaya). */
export function getDairas() {
  return load("dairas.json").dairas;
}

/** Flat array of the 1541 communes (each with wilaya + daïra + postal code). */
export function getCommunes() {
  return load("communes.json").communes;
}

/**
 * One wilaya's full subtree by its number (1..69).
 * @param {number} num
 * @returns {object|undefined}
 */
export function byWilaya(num) {
  const nn = String(num).padStart(2, "0");
  try {
    return load(`by-wilaya/${nn}.json`);
  } catch {
    return undefined;
  }
}

/**
 * All communes matching a 5-digit postal code.
 * @param {string} code
 * @returns {object[]}
 */
export function findByPostalCode(code) {
  return getCommunes().filter((c) => c.code_postal === code);
}

/**
 * Communes whose French name contains the query (case-insensitive).
 * @param {string} query
 * @returns {object[]}
 */
export function findCommune(query) {
  const q = query.toLowerCase();
  return getCommunes().filter((c) => c.nom_fr.toLowerCase().includes(q));
}

export default { getAll, getWilayas, getDairas, getCommunes, byWilaya, findByPostalCode, findCommune };
