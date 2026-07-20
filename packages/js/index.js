import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");

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
