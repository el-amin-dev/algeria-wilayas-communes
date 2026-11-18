/**
 * The v1 shape projector — five cached builders, and nothing else.
 *
 * v2's generated data is **normalized**: a commune carries `wilaya: 19` and
 * `daira: "19-ain-azel"` by reference, and the denormalized `wilaya_*` /
 * `daira_*` columns of v1 are gone. This module puts them back, **on demand**,
 * so that every v1 call site keeps working byte for byte.
 *
 * ---------------------------------------------------------------------------
 * ## Six rules, all load-bearing
 * ---------------------------------------------------------------------------
 *
 * **1. No `node:fs`, no `node:path`, no `import.meta.url`.** v1's `index.js`
 * read its JSON off disk, which is repo defect #2 and the reason v1 cannot run
 * in a browser bundle, Vite, a Cloudflare Worker, Deno or React Native **at
 * all**. Everything below reprojects from the inlined generated constants.
 * Reintroducing a file read here would re-break every one of those targets
 * while looking like a harmless import.
 *
 * **2. Field order is part of the contract.** Every object literal below writes
 * its keys **explicitly, in the frozen order**. Never build one of these with
 * spread-from-source (`{ ...w, extra }`): key-insertion order in the literal IS
 * the emitted key order, and spreading makes that order depend on the input.
 * `JSON.stringify` on these results must reproduce `data/*.json` byte for byte,
 * because people do serialize them. This is the same standing rule as
 * `scripts/build-data.ts` Phase 3 — read its banner comment.
 *
 * **3. Iteration is document order.** Wilayas 1→69, daïras in array order
 * within a wilaya, communes in array order within a daïra. **No sorting, ever.**
 * `getCommunes()[0]` must be the same commune in v1 and v2.
 *
 * **4. Reprojection, not aliasing.** Each builder allocates **its own**
 * objects, exactly mirroring v1's per-file `JSON.parse` caches. That is what
 * makes `getCommunes()` rows and `getAll().wilayas[…].dairas[…].communes[…]`
 * rows *distinct objects*, as they already were in v1 (three separate files,
 * three separate parses), and it is why a mutation through one view is not
 * visible through another. Sharing a record between two builders would be
 * cheaper and would silently change observable semantics.
 *
 * **5. Lazy + memoized.** Nothing runs at module scope — not one
 * `const x = build()`. Each builder is a module-scope `let … | undefined` plus
 * its filler, exactly the idiom in `../indexes.ts`, so a consumer who imports
 * `/legacy` and calls only `getWilayas()` never allocates the 1541 commune
 * projections. Memoizing is also the contract: `getCommunes() === getCommunes()`
 * was true in v1 and must stay true.
 *
 * **6. Deliberately NOT frozen. Do not "harden" this.** `Object.isFrozen(getCommunes())`
 * must be `false`, and a caller's mutation must persist across calls —
 * `getCommunes()[0].nom_fr = "X"` is still visible to the next `getCommunes()`.
 * v1 handed out the live parse result, so that behaviour is part of the
 * contract, and it is the documented mitigation for the v2-freezes-data break:
 * a consumer who genuinely relied on patching the dataset in place has
 * somewhere to go. The v2 root freezes its arrays *because* nothing there
 * promised otherwise; `/legacy` promised otherwise. A later hardening pass that
 * adds `Object.freeze` below is a break, not a fix.
 *
 * ---------------------------------------------------------------------------
 * ## Memory
 * ---------------------------------------------------------------------------
 *
 * The projections roughly **double the resident data** for a consumer who uses
 * them: the denormalized columns are materialized, so every commune row grows
 * from three name strings and two ids to twelve fields, and the nested tree is
 * a second full copy of the corpus. That is the price of the v1 contract. It is
 * paid **only by callers who ask for it** — rule 5 guarantees an untouched
 * builder costs nothing — and it is precisely why the v2 API is the one the
 * README sells.
 *
 * @module
 */

import { COMMUNES } from "../generated/communes";
import { DAIRAS } from "../generated/dairas";
import { DOCUMENT } from "../generated/document";
import {
  COMMUNE_COUNT,
  DAIRA_COUNT,
  MISSING_POSTAL_CODE_COUNT,
  POSTAL_CODE_COUNT,
  WILAYA_COUNT,
} from "../generated/meta";
import { WILAYAS } from "../generated/wilayas";

import type { Commune as GeneratedCommune } from "../generated/communes";
import type { Daira as GeneratedDaira } from "../generated/dairas";
import type { Wilaya as GeneratedWilaya } from "../generated/wilayas";
import type { Algeria, Commune, CommuneFlat, Daira, DairaFlat, Wilaya, WilayaFlat } from "./types";

// ---------------------------------------------------------------------------
// The one shared derivation
// ---------------------------------------------------------------------------

/**
 * v1's `code` from v2's `code`.
 *
 * **This is the trap of the whole session.** v2's `Wilaya.code` is the *number*
 * `16`; v1's `code` was the zero-padded *string* `"16"`, and `"06"` for Bejaia.
 * Passing `w.code` straight through would produce `16` where v1 emitted `"16"` —
 * a JSON type change on every wilaya row, in every one of the four flat and
 * nested views, and `"1"` instead of `"01"` once stringified.
 *
 * The build asserted that the source's padded string agrees with the number, so
 * `String(code).padStart(2, "0")` is lossless.
 */
function padCode(code: number): string {
  return String(code).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// 1. buildAlgeria — the nested tree, `getAll()`
// ---------------------------------------------------------------------------

let algeriaValue: Algeria | undefined;

/**
 * The whole document in v1 shape: `data/algeria.json`, reconstructed.
 *
 * The six document-level keys (`pays`, `langues`, `reforme`, `hierarchie`,
 * `note_daira`, `sources`) come from `../generated/document`, which exists for
 * exactly this reason — they are not derivable from the three record arrays.
 * The five counts come from `../generated/meta`; they are re-exported build
 * outputs, not recomputed here, so a drift between the document header and the
 * records is a build failure rather than a silently self-consistent lie.
 *
 * ⚠️ **The nested daïra writes `communes` BEFORE `nb_communes`.** v1's
 * `index.d.ts` declares the opposite order, but `data/algeria.json` and the 69
 * `data/by-wilaya/NN.json` files on disk have `communes` first, and the
 * acceptance gate is `JSON.stringify(getAll())` against those bytes — the
 * harder constraint. A TypeScript interface imposes no runtime key order, so
 * **on-disk order wins**. `scripts/build-data.ts` carries the same note
 * ("nb_communes LAST — frozen, deliberate, do not tidy"). A test pins it.
 *
 * @returns The memoized v1 document. Same reference on every call, not frozen.
 *
 * @example
 * ```ts
 * buildAlgeria().nb_wilayas;          // → 69
 * buildAlgeria().wilayas[18]?.nom_fr; // → "Setif"
 * ```
 */
export function buildAlgeria(): Algeria {
  if (algeriaValue === undefined) {
    const dairasOfWilaya = groupDairasByWilaya();
    const communesOfDaira = groupCommunesByDaira();

    const wilayas: Wilaya[] = [];
    for (const w of WILAYAS) {
      const dairas: Daira[] = [];
      /* v8 ignore next 3 -- the two `?? []` arms are unreachable on this
         dataset: all 69 wilayas have at least one daira and all 566 dairas have
         at least one commune, and build-data.ts asserts both. Kept rather than
         asserted non-null so a future data hole degrades to an empty list
         instead of a TypeError deep inside the projection. */
      for (const d of dairasOfWilaya.get(w.code) ?? []) {
        const communes: Commune[] = [];
        for (const c of communesOfDaira.get(d.id) ?? []) {
          communes.push({
            nom_ar: c.name.ar,
            nom_fr: c.name.fr,
            nom_en: c.name.en,
            code_postal: c.postalCode,
          });
        }
        dairas.push({
          nom_ar: d.name.ar,
          nom_fr: d.name.fr,
          nom_en: d.name.en,
          // `communes` BEFORE `nb_communes` — on-disk order. See the note above.
          communes,
          nb_communes: d.communeCount,
        });
      }
      wilayas.push({
        wilaya_num: w.code,
        code: padCode(w.code),
        nom_ar: w.name.ar,
        nom_fr: w.name.fr,
        nom_en: w.name.en,
        nb_dairas: w.dairaCount,
        nb_communes: w.communeCount,
        dairas,
      });
    }

    algeriaValue = {
      pays: {
        nom_ar: DOCUMENT.pays.nom_ar,
        nom_fr: DOCUMENT.pays.nom_fr,
        nom_en: DOCUMENT.pays.nom_en,
        code_iso: DOCUMENT.pays.code_iso,
      },
      // Copied, not aliased: the generated arrays are `readonly string[]` and
      // the v1 type is mutable, and rule 4 says every builder owns its output.
      langues: [...DOCUMENT.langues],
      reforme: DOCUMENT.reforme,
      hierarchie: DOCUMENT.hierarchie,
      nb_wilayas: WILAYA_COUNT,
      nb_dairas: DAIRA_COUNT,
      nb_communes: COMMUNE_COUNT,
      codes_postaux_renseignes: POSTAL_CODE_COUNT,
      codes_postaux_manquants: MISSING_POSTAL_CODE_COUNT,
      note_daira: DOCUMENT.note_daira,
      sources: [...DOCUMENT.sources],
      wilayas,
    };
  }
  return algeriaValue;
}

// ---------------------------------------------------------------------------
// 2. buildWilayasFlat — `getWilayas()`, 69 rows
// ---------------------------------------------------------------------------

let wilayasFlatValue: WilayaFlat[] | undefined;

/**
 * The 69 rows of `data/wilayas.json`, in code order.
 *
 * `nom_en` is the **resolved** string, not a fallback expression: it is already
 * materialized in the generated data (built with a one-entry override table,
 * `Alger` → `Algiers`), so row 15 reads `"Algiers"` and all 68 others read
 * their `nom_fr`. Writing `w.name.en ?? w.name.fr` here would be both redundant
 * and a place for the override to get lost.
 *
 * @returns The memoized 69 flat wilayas. Same reference on every call, not frozen.
 *
 * @example
 * ```ts
 * buildWilayasFlat().length;         // → 69
 * buildWilayasFlat()[18]?.code;      // → "19"       (Setif; a padded STRING)
 * buildWilayasFlat()[5]?.code;       // → "06"       (Bejaia; the padding matters)
 * buildWilayasFlat()[15]?.nom_en;    // → "Algiers"  (the only nom_en !== nom_fr)
 * ```
 */
export function buildWilayasFlat(): WilayaFlat[] {
  if (wilayasFlatValue === undefined) {
    const out: WilayaFlat[] = [];
    for (const w of WILAYAS) {
      out.push({
        wilaya_num: w.code,
        code: padCode(w.code),
        nom_ar: w.name.ar,
        nom_fr: w.name.fr,
        nom_en: w.name.en,
        nb_dairas: w.dairaCount,
        nb_communes: w.communeCount,
      });
    }
    wilayasFlatValue = out;
  }
  return wilayasFlatValue;
}

// ---------------------------------------------------------------------------
// 3. buildDairasFlat — `getDairas()`, 566 rows, NO `wilaya_ar`
// ---------------------------------------------------------------------------

let dairasFlatValue: DairaFlat[] | undefined;

/**
 * The 566 rows of `data/dairas.json`, in document order.
 *
 * !! READ BEFORE "FIXING" THE MISSING `wilaya_ar` BELOW !!
 *
 * These rows carry `wilaya_fr` and `wilaya_en` but **no `wilaya_ar`**, while
 * {@link buildCommunesFlat}'s rows carry all three. That is almost certainly an
 * oversight in the original `jq` filter that produced `data/dairas.json`, and
 * it is reproduced here **deliberately**.
 *
 * `data/*.json` is a **published contract**: it is served over the jsDelivr CDN
 * and consumed by the jq, Python and Java examples in the root README. Adding
 * the field changes what `getDairas()` returns, changes the JSON every CDN
 * consumer receives, and fails the byte-identity gate on `data/`. It is
 * recorded as a **candidate v3 change** — a major-version data break — not
 * something to slip in here. The identical note lives on `DairaFlat` in
 * `./types.ts` and in `scripts/build-data.ts` Phase 3.
 *
 * @returns The memoized 566 flat daïras. Same reference on every call, not frozen.
 *
 * @example
 * ```ts
 * buildDairasFlat().length;                                    // → 566
 * buildDairasFlat().filter((d) => d.wilaya_num === 19).length; // → 20   (Setif)
 * Object.keys(buildDairasFlat()[0] ?? {}).length;              // → 8    (no wilaya_ar)
 * ```
 */
export function buildDairasFlat(): DairaFlat[] {
  if (dairasFlatValue === undefined) {
    const wilayaOf = indexWilayasByCode();
    const out: DairaFlat[] = [];
    for (const d of DAIRAS) {
      const w = wilayaOf.get(d.wilaya);
      /* v8 ignore next -- unreachable: every daira's `wilaya` is one of the 69
         codes, asserted at build time. The guard exists only to avoid a `!`. */
      if (w === undefined) continue;
      out.push({
        wilaya_num: w.code,
        wilaya_code: padCode(w.code),
        wilaya_fr: w.name.fr,
        wilaya_en: w.name.en,
        // No `wilaya_ar` — deliberate. See the note above.
        nom_ar: d.name.ar,
        nom_fr: d.name.fr,
        nom_en: d.name.en,
        nb_communes: d.communeCount,
      });
    }
    dairasFlatValue = out;
  }
  return dairasFlatValue;
}

// ---------------------------------------------------------------------------
// 4. buildCommunesFlat — `getCommunes()`, 1541 rows, WITH `wilaya_ar`
// ---------------------------------------------------------------------------

let communesFlatValue: CommuneFlat[] | undefined;

/**
 * The 1541 rows of `data/communes.json`, in document order.
 *
 * Twelve fields per row, and unlike {@link buildDairasFlat} these **do** carry
 * `wilaya_ar` — see the asymmetry note there.
 *
 * `code_postal` is `c.postalCode` passed straight through. The `PostalCode`
 * brand erases at run time, so the value is the same string it always was, and
 * the 30 `null`s are preserved as `null` rather than coerced to `""` or
 * dropped — `findByPostalCode` depends on that, since `null === code` is false
 * for every string.
 *
 * @returns The memoized 1541 flat communes. Same reference on every call, not frozen.
 *
 * @example
 * ```ts
 * buildCommunesFlat().length;                                       // → 1541
 * buildCommunesFlat().filter((c) => c.code_postal === null).length; // → 27
 * buildCommunesFlat().find((c) => c.code_postal === "19018")?.nom_fr;
 * // → "Ain Lahdjar"   (Setif, daïra Ain Azel)
 * ```
 */
export function buildCommunesFlat(): CommuneFlat[] {
  if (communesFlatValue === undefined) {
    const wilayaOf = indexWilayasByCode();
    const dairaOf = indexDairasById();
    const out: CommuneFlat[] = [];
    for (const c of COMMUNES) {
      const w = wilayaOf.get(c.wilaya);
      const d = dairaOf.get(c.daira);
      /* v8 ignore next -- unreachable: every commune's `wilaya` and `daira` were
         proven to resolve at build time. The guard exists only to avoid a `!`. */
      if (w === undefined || d === undefined) continue;
      out.push({
        wilaya_num: w.code,
        wilaya_code: padCode(w.code),
        wilaya_ar: w.name.ar,
        wilaya_fr: w.name.fr,
        wilaya_en: w.name.en,
        daira_ar: d.name.ar,
        daira_fr: d.name.fr,
        daira_en: d.name.en,
        nom_ar: c.name.ar,
        nom_fr: c.name.fr,
        nom_en: c.name.en,
        code_postal: c.postalCode,
      });
    }
    communesFlatValue = out;
  }
  return communesFlatValue;
}

// ---------------------------------------------------------------------------
// 5. buildWilayaTree — `byWilaya(num)`, one wilaya at a time
// ---------------------------------------------------------------------------

let wilayaTreeCache: Map<string, Wilaya> | undefined;

/**
 * One wilaya's full subtree, keyed by its **padded** code, memoized per code.
 *
 * This is a third, independent projection of the same records — it shares no
 * object with {@link buildAlgeria}. That mirrors v1 exactly, where
 * `by-wilaya/16.json` was its own file and its own `JSON.parse`, so
 * `byWilaya(16) !== getAll().wilayas[15]` and a mutation through one was never
 * visible through the other.
 *
 * Built per requested wilaya, not as a slice of the whole tree: asking for
 * Setif must not materialize the other 68 subtrees.
 *
 * @param code - The zero-padded wilaya code, `"01"`..`"69"`. Anything else — an
 *   unpadded `"1"`, a `"016"`, a `"70"`, a `"undefined"` — simply misses.
 * @returns The memoized subtree, or `undefined` on a miss. **Never throws**,
 *   for any input.
 *
 * @example
 * ```ts
 * buildWilayaTree("19")?.nom_fr;                    // → "Setif"
 * buildWilayaTree("19")?.dairas.length;             // → 20
 * buildWilayaTree("19") === buildWilayaTree("19");  // → true (memoized)
 * buildWilayaTree("016");                           // → undefined
 * ```
 */
export function buildWilayaTree(code: string): Wilaya | undefined {
  if (wilayaTreeCache === undefined) wilayaTreeCache = new Map<string, Wilaya>();
  const cached = wilayaTreeCache.get(code);
  if (cached !== undefined) return cached;

  const w = indexWilayasByPaddedCode().get(code);
  if (w === undefined) return undefined;

  // Group this wilaya's communes only. Projected into v1 shape as we go, so
  // each commune object is allocated exactly once and lands in exactly one
  // daïra's array.
  const communesOfDaira = new Map<string, Commune[]>();
  for (const c of COMMUNES) {
    if (c.wilaya !== w.code) continue;
    const projected: Commune = {
      nom_ar: c.name.ar,
      nom_fr: c.name.fr,
      nom_en: c.name.en,
      code_postal: c.postalCode,
    };
    const bucket = communesOfDaira.get(c.daira);
    if (bucket === undefined) communesOfDaira.set(c.daira, [projected]);
    else bucket.push(projected);
  }

  const dairas: Daira[] = [];
  for (const d of DAIRAS) {
    if (d.wilaya !== w.code) continue;
    dairas.push({
      nom_ar: d.name.ar,
      nom_fr: d.name.fr,
      nom_en: d.name.en,
      // `communes` BEFORE `nb_communes` — on-disk order, see buildAlgeria.
      /* v8 ignore next -- the `?? []` arm is unreachable: every daïra has communeCount >= 1. */
      communes: communesOfDaira.get(d.id) ?? [],
      nb_communes: d.communeCount,
    });
  }

  const built: Wilaya = {
    wilaya_num: w.code,
    code: padCode(w.code),
    nom_ar: w.name.ar,
    nom_fr: w.name.fr,
    nom_en: w.name.en,
    nb_dairas: w.dairaCount,
    nb_communes: w.communeCount,
    dairas,
  };
  wilayaTreeCache.set(code, built);
  return built;
}

// ---------------------------------------------------------------------------
// Local lookup helpers
//
// Deliberately built as LOCALS inside the builders that need them, rather than
// as extra module-scope memo slots: each builder runs at most once, so the map
// is a one-off O(n) pass that is garbage a microsecond later, and the module
// keeps exactly five pieces of retained state. They also read the generated
// arrays directly instead of calling the v2 accessors, so importing `/legacy`
// never constructs a v2 index — the import-purity test in `../indexes.ts`
// (`__indexState()`) must stay all-`false` after a legacy-only call.
// ---------------------------------------------------------------------------

/** Numeric wilaya code → the generated wilaya record. */
function indexWilayasByCode(): Map<number, GeneratedWilaya> {
  const m = new Map<number, GeneratedWilaya>();
  for (const w of WILAYAS) m.set(w.code, w);
  return m;
}

/** Zero-padded wilaya code (`"06"`, `"19"`) → the generated wilaya record. */
let paddedCodeIndex: Map<string, GeneratedWilaya> | undefined;

function indexWilayasByPaddedCode(): Map<string, GeneratedWilaya> {
  // Memoized, unlike its two siblings, because it is the only one reached from
  // OUTSIDE a memoized builder: `buildWilayaTree` consults it on every call, and
  // a miss returns before the tree cache is written. So `byWilaya(userInput)`
  // over dirty input — the exact case v1's try/catch existed to swallow — would
  // otherwise rebuild all 69 entries on every single miss.
  if (paddedCodeIndex === undefined) {
    const m = new Map<string, GeneratedWilaya>();
    for (const w of WILAYAS) m.set(padCode(w.code), w);
    paddedCodeIndex = m;
  }
  return paddedCodeIndex;
}

/** Daïra id (`"19-ain-azel"`) → the generated daïra record. */
function indexDairasById(): Map<string, GeneratedDaira> {
  const m = new Map<string, GeneratedDaira>();
  for (const d of DAIRAS) m.set(d.id, d);
  return m;
}

/** Wilaya code → its daïras, in document order. */
function groupDairasByWilaya(): Map<number, GeneratedDaira[]> {
  const m = new Map<number, GeneratedDaira[]>();
  for (const d of DAIRAS) {
    const bucket = m.get(d.wilaya);
    if (bucket === undefined) m.set(d.wilaya, [d]);
    else bucket.push(d);
  }
  return m;
}

/** Daïra id → its communes, in document order. */
function groupCommunesByDaira(): Map<string, GeneratedCommune[]> {
  const m = new Map<string, GeneratedCommune[]>();
  for (const c of COMMUNES) {
    const bucket = m.get(c.daira);
    if (bucket === undefined) m.set(c.daira, [c]);
    else bucket.push(c);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Debug hook
// ---------------------------------------------------------------------------

/**
 * Which of the five lazy v1 projections have been built.
 *
 * **Exported from this module only — never from `index.ts` or `legacy/index.ts`**,
 * exactly like `__indexState` in `indexes.ts`, so the bundler drops it from
 * `dist/` entirely. It exists so the import-purity invariant can be *asserted*:
 * importing the package root must build no v1 projection at all, since a root
 * consumer who never touches the compat shims should not pay for the
 * denormalized columns — which roughly double the resident data.
 *
 * @returns A flag per lazy structure: `algeria`, `wilayasFlat`, `dairasFlat`,
 *   `communesFlat`, `wilayaTrees`, `paddedCodeIndex`.
 *
 * @example
 * ```ts
 * import { __legacyState } from "./project";
 * Object.values(__legacyState()).some(Boolean); // → false at import time
 * ```
 *
 * @since 2.0.0
 */
export function __legacyState(): Record<string, boolean> {
  return {
    algeria: algeriaValue !== undefined,
    wilayasFlat: wilayasFlatValue !== undefined,
    dairasFlat: dairasFlatValue !== undefined,
    communesFlat: communesFlatValue !== undefined,
    wilayaTrees: wilayaTreeCache !== undefined,
    paddedCodeIndex: paddedCodeIndex !== undefined,
  };
}
