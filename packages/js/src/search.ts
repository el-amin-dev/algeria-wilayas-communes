/**
 * Ranked multilingual search across wilayas, daïras and communes.
 *
 * ## Why this is fast
 *
 * v1 called `.toLowerCase()` on 1541 corpus strings **per query** — 1541
 * allocations and 1541 comparisons to answer a question two binary searches can
 * answer. v2 normalizes the corpus **once, at build time**, into
 * `generated/search-keys.ts`, and normalizes exactly **one string per call** at
 * run time: the query. Nothing in this file may call `.toLowerCase()` or
 * `.normalize("NFD")`; `normalize()` is the only entry point, and it is invoked
 * once, on line one of `search()`.
 *
 * ## The index is the sort order
 *
 * `SEARCH_KEYS` ships sorted ascending by UTF-16 code unit. That sort order **is**
 * the prefix index — two binary searches give the `[lo, hi)` range of every key
 * with a given prefix, at ~13 comparisons for 4402 keys, with zero extra bundle
 * bytes and zero build cost on first search. A trie would buy an asymptotic
 * advantage worth those 13 comparisons in exchange for thousands of node
 * allocations. It was considered and rejected; see session 2's spec.
 *
 * **Every comparison in this file must use plain `<` / `>` on strings.** That is
 * UTF-16 code-unit order, which is exactly what the build-time sort used.
 * `localeCompare` would order Arabic and accented Latin differently and every
 * prefix lookup would silently miss.
 *
 * ## Packed refs
 *
 * `SEARCH_REFS[i]` is an integer, not an object — 4402 object literals in the
 * module graph would dwarf the data they describe:
 *
 * ```text
 * ref = (index << 3) | (kind << 1) | lang
 *   lang   bit 0     0 = fr, 1 = ar
 *   kind   bits 1-2  0 = wilaya, 1 = daira, 2 = commune
 *   index  bits 3+   position in WILAYAS / DAIRAS / COMMUNES
 * ```
 *
 * Dropping the low bit (`ref >>> 1`) yields a stable per-**record** identity,
 * which is what deduplication keys on: a record found through its French key and
 * again through its Arabic key is one result, not two.
 */

import { COMMUNES } from "./generated/communes";
import { DAIRAS } from "./generated/dairas";
import { EN_OVERRIDES, SEARCH_KEYS, SEARCH_REFS } from "./generated/search-keys";
import { wilayaIdx, wilayaList } from "./indexes";
import { normalize } from "./normalize";

import type { WilayaCode } from "./generated/codes";
import type { Commune, Daira, Wilaya } from "./types";

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * The three kinds of record `search()` can return.
 *
 * Also the tie-break order when two results score identically: `"wilaya"` ranks
 * above `"daira"`, which ranks above `"commune"`.
 *
 * @since 2.0.0
 */
export type SearchKind = "wilaya" | "daira" | "commune";

/**
 * The language layer a result matched on. `"en"` means the exonym override table.
 *
 * Exported for the same reason {@link SearchKind} is: it appears in the public
 * shape of {@link SearchResult}, so it is already frozen for the life of the
 * major whether or not it has a name. Exporting it adds no liability that the
 * structural position had not already committed to -- it only lets a consumer
 * write `MatchedLang` instead of `SearchResult["matched"]`. Decided in the
 * pre-2.0.0 export-surface pass; see docs/DECISIONS.md ADR-016.
 *
 * @since 2.0.0
 */
export type MatchedLang = "ar" | "fr" | "en";

/**
 * Options for {@link search}. Every field is optional; `search(q)` with no
 * options searches all three kinds across all language layers, non-fuzzy,
 * capped at 20 results.
 *
 * @since 2.0.0
 */
export interface SearchOptions {
  /**
   * Language layer to search. Omit to search all layers.
   *
   * `"en"` **aliases** `"fr"`: `name.en` differs from `name.fr` for exactly one
   * record in the whole dataset (wilaya 16, `Alger` / `Algiers`), so shipping a
   * third full key layer would add 2201 keys — about a third of the index — to
   * serve one row. Instead `"en"` searches the French keys plus a one-entry
   * override table, and a hit on that table reports `matched: "en"`.
   *
   * That override table is consulted **only** when `lang` is exactly `"en"`.
   * Folding it into the default layer would make `search("algier")` return Alger
   * without `fuzzy: true` — `"algiers"` contains `"algier"` — which would quietly
   * turn the opt-in fuzzy flag into a decoration for one very popular record.
   * So `search("Algiers")` finds nothing; `search("Algiers", { lang: "en" })`
   * finds wilaya 16.
   */
  lang?: "ar" | "fr" | "en";
  /**
   * Maximum number of results. Default 20.
   *
   * This **short-circuits the scan**; it is not a trailing `.slice()`. Stopping
   * early is safe *across* tiers — the score bands do not overlap, so no result
   * left unscanned in the substring tier could ever have outranked one already
   * collected by the prefix tier.
   *
   * ⚠️ **It is NOT a top-N.** *Within* a single tier, matches are collected in
   * key order and only sorted afterwards, so a low-scoring early match can
   * displace a higher-scoring later one. This is visible on ordinary input:
   *
   * ```ts
   * search("ain")                    // 20 rows, scores 0.775 … 0.7333
   * search("ain", { limit: 5000 })   // 182 rows; the true top 20 are 0.775 ×17
   * ```
   *
   * Fifteen records scoring 0.775 — `Ain Taya` (wilaya 16) among them — are
   * absent from the default result, displaced by records scoring as low as
   * 0.7333. **If you need a genuine top-N, pass a large `limit` and slice the
   * result yourself**; the cost is a full tier scan (`search("ain")` 2.3 µs
   * versus `search("ain", { limit: 5000 })` 72 µs).
   *
   * This is a deliberate trade: capping during the scan is what keeps a
   * one-character query at ~2 µs instead of ~500 µs.
   */
  limit?: number;
  /**
   * Restrict results to one wilaya.
   *
   * The highest-leverage option in the API, and a genuine **candidate
   * reduction** rather than a filter over results: the two tiers that *scan* —
   * substring and fuzzy — walk a reverse index of that wilaya's key positions
   * instead of the 4402-key array. A bucket is ~162 keys for Setif and ~20 for
   * the smallest wilayas.
   *
   * The exact and prefix tiers keep the global structures (a `Map` lookup and
   * two binary searches) and simply filter each hit by wilaya, because they are
   * already sublinear and a bucket walk would be slower for them.
   *
   * Measured: `search("setif")` 33 µs unscoped, 5 µs with `{ wilaya: 19 }`;
   * `search("algier", { fuzzy: true })` 48 µs unscoped, 4 µs scoped;
   * `search("lahdjar")` 2203 key comparisons unscoped, 83 scoped (26.5×).
   * `search("ain", { wilaya: 19 })` returns the 13 hits inside Setif where the
   * unscoped query has well over 100.
   */
  wilaya?: WilayaCode;
  /**
   * Enable bounded fuzzy matching as a last resort. Default `false`.
   *
   * Runs only after exact, prefix and substring have all come up short of
   * `limit`, so turning it on costs nothing on queries that already match.
   */
  fuzzy?: boolean;
  /** Restrict the record kinds returned. Default: all three. */
  kinds?: readonly SearchKind[];
}

/**
 * One ranked search hit.
 *
 * A discriminated union on `kind`, so `if (r.kind === "commune")` narrows `item`
 * to `Commune` with no cast under `strict`.
 *
 * **Every result carries `wilaya`**, the full record, because that is what
 * disambiguates the 38 duplicated commune names: `search("sidi ameur")`
 * legitimately returns two communes, wilaya 32 and wilaya 64, and
 * `search("عين الحجر")` returns three, in wilayas 10, 19 and 20. A result that is
 * only a name is undisambiguable. For `kind: "wilaya"`, `item` and `wilaya` are
 * the same object — that keeps the union uniform and costs nothing.
 *
 * @since 2.0.0
 */
export type SearchResult =
  | {
      readonly kind: "wilaya";
      readonly item: Wilaya;
      /** The owning wilaya. For a wilaya hit, the same object as `item`. */
      readonly wilaya: Wilaya;
      /**
       * Relevance in `[0.25, 1.0]`, from four non-overlapping bands.
       *
       * | Tier | Formula | Range |
       * |---|---|---|
       * | exact | `1.0` | 1.0 |
       * | prefix | `0.7 + 0.2 × (q.length / key.length)` | 0.7 – 0.9 |
       *
       * 0.9 is a BOUND, not an attained value: it needs `q.length === key.length`,
       * which the exact tier always intercepts first. Observed maximum is 0.86.
       * | substring | `0.4 + 0.2 × (q.length / key.length)` | 0.4 – 0.6 |
       * | fuzzy | `0.35 − 0.05 × (distance − 1)` | 0.25 – 0.35 |
       *
       * The bands are **published and frozen** so consumers can threshold on them
       * (`results.filter((r) => r.score >= 0.7)` keeps exact and prefix hits
       * only). Changing these numbers is a breaking change.
       *
       * The length ratio inside a tier means a query covering more of the key
       * ranks higher: `"setif"` against key `"setif"` is exact (1.0); `"ain"`
       * against `"ain azel"` scores `0.7 + 0.2 × 3/8 = 0.775`; against
       * `"ain lahdjar"` it scores `0.7 + 0.2 × 3/11 = 0.755`. With `maxDistance`
       * capped at 2 the fuzzy tier emits only 0.35 and 0.30 today; 0.25 is the
       * documented band floor.
       */
      readonly score: number;
      /** Which language layer matched. `"en"` means the exonym override table. */
      readonly matched: MatchedLang;
    }
  | {
      readonly kind: "daira";
      readonly item: Daira;
      /** The owning wilaya, resolved from `item.wilaya`. */
      readonly wilaya: Wilaya;
      /** Relevance in `[0.25, 1.0]`. See the score table on the `"wilaya"` variant. */
      readonly score: number;
      /** Which language layer matched. */
      readonly matched: MatchedLang;
    }
  | {
      readonly kind: "commune";
      readonly item: Commune;
      /** The owning wilaya, resolved from `item.wilaya` — this is what disambiguates duplicate names. */
      readonly wilaya: Wilaya;
      /** Relevance in `[0.25, 1.0]`. See the score table on the `"wilaya"` variant. */
      readonly score: number;
      /** Which language layer matched. */
      readonly matched: MatchedLang;
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KIND_WILAYA = 0;
const KIND_DAIRA = 1;
const KIND_COMMUNE = 2;

/** All three kinds, as a bitmask over `1 << kind`. */
const ALL_KINDS = (1 << KIND_WILAYA) | (1 << KIND_DAIRA) | (1 << KIND_COMMUNE);

/** `langBit` sentinel meaning "accept both the fr and the ar layer". */
const LANG_ANY = -1;

const LANG_FR = 0;
const LANG_AR = 1;

/** `substringLangBit` sentinel meaning "no key in either layer can contain this query". */
const LANG_NONE = -2;

const DEFAULT_LIMIT = 20;

const SCORE_EXACT = 1.0;
const PREFIX_BASE = 0.7;
const PREFIX_SPAN = 0.2;
const SUBSTRING_BASE = 0.4;
const SUBSTRING_SPAN = 0.2;
const FUZZY_BASE = 0.35;
const FUZZY_STEP = 0.05;

/** Tie-break rank per kind: wilaya, then daira, then commune. */
const KIND_RANK: Readonly<Record<SearchKind, number>> = {
  wilaya: 0,
  daira: 1,
  commune: 2,
};

/** The answer to an empty query. Shared; typed `readonly`. */
// Frozen, not merely typed `readonly`. `readonly` is erased at run time, and this
// single array is handed back by EVERY miss -- `findByPostalCode("99999")` and
// `findCommunesByName("Paris")` return the same object -- so one `push` from
// plain JavaScript would poison every future miss across both functions for the
// life of the process. `Object.freeze` on an empty literal is O(1) and allocates
// nothing, so it does not weaken the no-work-at-import-time invariant: that rule
// forbids INDEX CONSTRUCTION on the import path, not a constant-time freeze.
const NO_RESULTS: readonly SearchResult[] = Object.freeze([]);

/** Candidate list for a wilaya with no keys at all — unreachable on real data. */
const NO_INDICES: readonly number[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Instrumentation
//
// A key-comparison counter, so a test can PROVE the `limit` short-circuit
// instead of eyeballing timings: run `search("a", { limit: 5 })` and
// `search("a", { limit: 500 })` and compare the counts. Timing-based assertions
// on a 10 µs operation are flaky by construction.
// ---------------------------------------------------------------------------

let comparisons = 0;

/**
 * The key-comparison counter and its reset.
 *
 * **Exported from this module only — never from `index.ts`.**
 *
 * @returns `comparisons`, the number of query-versus-key comparisons performed
 *   since the last reset, and `reset()` to zero it.
 *
 * @example
 * ```ts
 * __searchStats().reset();
 * search("a", { limit: 5 });
 * const few = __searchStats().comparisons;
 * __searchStats().reset();
 * search("a", { limit: 500 });
 * few < __searchStats().comparisons; // → true: the limit really stops the scan
 * ```
 *
 * @since 2.0.0
 */
export function __searchStats(): { readonly comparisons: number; readonly reset: () => void } {
  return { comparisons, reset: __resetSearchStats };
}

/**
 * Zeroes the key-comparison counter. Module-only, like {@link __searchStats}.
 *
 * @returns Nothing.
 *
 * @since 2.0.0
 */
export function __resetSearchStats(): void {
  comparisons = 0;
}

// ---------------------------------------------------------------------------
// Two lazy structures — the same discipline as indexes.ts: no top-level build
// ---------------------------------------------------------------------------

let exactIndex: Map<string, readonly number[]> | undefined;

/**
 * Normalized key → the positions in `SEARCH_KEYS` that hold it.
 *
 * An array value, because one key legitimately belongs to several records: the
 * key `"adrar"` is the wilaya, its daïra and its commune.
 *
 * 4402 insertions on first search, comfortably inside the 2 ms budget. Never
 * built at module scope.
 *
 * @returns The exact-match index.
 */
function exactIdx(): Map<string, readonly number[]> {
  if (exactIndex === undefined) {
    const m = new Map<string, number[]>();
    for (let i = 0; i < SEARCH_KEYS.length; i++) {
      const k = SEARCH_KEYS[i];
      /* v8 ignore next -- unreachable: `i < SEARCH_KEYS.length`, so this read is always
         in range. The check exists only to satisfy `noUncheckedIndexedAccess` without a
         non-null assertion. */
      if (k === undefined) continue;
      const bucket = m.get(k);
      if (bucket === undefined) m.set(k, [i]);
      else bucket.push(i);
    }
    exactIndex = m;
  }
  return exactIndex;
}

let wilayaKeysIndex: Map<WilayaCode, readonly number[]> | undefined;

/**
 * `WilayaCode` → every position in `SEARCH_KEYS` belonging to that wilaya.
 *
 * This is what makes `opts.wilaya` an actual **candidate reduction** rather than
 * a filter applied to results. A bucket holds roughly
 * `2 × (1 + dairaCount + communeCount)` keys: 162 of 4402 for Setif, about 20
 * for the smallest wilayas.
 *
 * **Only the two scanning tiers use it.** The exact tier answers from a `Map`
 * and the prefix tier from two binary searches over the globally sorted array;
 * both are already sublinear, and making them walk a 162-key bucket instead
 * would be *slower* — a scoped `search("ain", { limit: 100 })` costs 101 key
 * comparisons through the sorted range and 244 through the bucket. They keep the
 * global structures and filter each hit by wilaya, exactly as they filter by
 * kind. Substring and fuzzy are the tiers that scan, and they are what the
 * spec's "reduces the candidate set before scanning" criterion is about.
 *
 * Consequently this map is built lazily by those two tiers and not by `search()`
 * itself: a scoped query satisfied by the exact or prefix tier never builds it,
 * and neither does any unscoped query.
 *
 * Positions are pushed in ascending order, so a bucket walk visits keys in the
 * same relative order the sorted array would — the tie-break ordering and the
 * determinism of a truncated tier come for free.
 *
 * Built by decoding every ref once: a wilaya ref indexes `WILAYAS` directly, a
 * daïra or commune ref reads `.wilaya` off its own record.
 *
 * @returns The 69-entry reverse index.
 */
function wilayaKeysIdx(): Map<WilayaCode, readonly number[]> {
  if (wilayaKeysIndex === undefined) {
    const m = new Map<WilayaCode, number[]>();
    for (let i = 0; i < SEARCH_REFS.length; i++) {
      const ref = SEARCH_REFS[i];
      /* v8 ignore next -- unreachable: `i < SEARCH_REFS.length`. */
      if (ref === undefined) continue;
      const code = wilayaCodeOfRef(ref);
      /* v8 ignore next -- unreachable: every ref the build emitted decodes to a record
         that exists, so its wilaya always resolves. */
      if (code === undefined) continue;
      const bucket = m.get(code);
      if (bucket === undefined) m.set(code, [i]);
      else bucket.push(i);
    }
    wilayaKeysIndex = m;
  }
  return wilayaKeysIndex;
}

let bucketIndex: Map<string, readonly [number, number]> | undefined;

/**
 * First character → the contiguous `[lo, hi)` range of `SEARCH_KEYS` holding it.
 *
 * Falls straight out of a single pass over the already-sorted array, so it is
 * effectively free, and the fuzzy tier depends on it: it is the prefilter that
 * cuts the fuzzy candidate set by 20–30×.
 *
 * @returns The first-character bucket map.
 */
function bucketMap(): Map<string, readonly [number, number]> {
  if (bucketIndex === undefined) {
    const m = new Map<string, [number, number]>();
    for (let i = 0; i < SEARCH_KEYS.length; i++) {
      const k = SEARCH_KEYS[i];
      /* v8 ignore next -- unreachable: `i < SEARCH_KEYS.length`. */
      if (k === undefined) continue;
      const head = k.charAt(0);
      const range = m.get(head);
      if (range === undefined) m.set(head, [i, i + 1]);
      else range[1] = i + 1;
    }
    bucketIndex = m;
  }
  return bucketIndex;
}

/**
 * Which of this module's three lazy structures have been built.
 *
 * **Exported from this module only — never from `index.ts`.** It exists so the
 * import-purity invariant can be asserted: `search("")` must return `[]` without
 * building any of them, and an unscoped call must never build `wilayaKeys`.
 *
 * @returns `{ exact, bucket, wilayaKeys }`, all `false` until the first non-empty
 *   query. `bucket` is built only by the fuzzy tier on an unscoped call;
 *   `wilayaKeys` only by a scoped call that actually reaches the substring or
 *   fuzzy tier — a scoped query the exact or prefix tier already answered leaves
 *   it unbuilt.
 *
 * @example
 * ```ts
 * search("");
 * __searchState(); // → { exact: false, bucket: false, wilayaKeys: false }
 *
 * search("setif");
 * __searchState().wilayaKeys; // → false — no scope was asked for
 * ```
 *
 * @since 2.0.0
 */
export function __searchState(): Record<string, boolean> {
  return {
    exact: exactIndex !== undefined,
    bucket: bucketIndex !== undefined,
    wilayaKeys: wilayaKeysIndex !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal scan state
// ---------------------------------------------------------------------------

/** A collected hit plus the key it matched on, which the tie-break needs. */
interface Scored {
  readonly key: string;
  readonly result: SearchResult;
}

interface Ctx {
  readonly q: string;
  readonly limit: number;
  readonly kindMask: number;
  /** `LANG_FR`, `LANG_AR`, or `LANG_ANY` for both. */
  readonly langBit: number;
  /**
   * The layer the *substring* tier has to touch, which is often narrower than
   * `langBit`. See {@link substringLangBitOf}; `LANG_NONE` skips the tier.
   */
  readonly substringLangBit: number;
  /** Whether the one-entry `en` exonym table participates. Only when `lang === "en"`. */
  readonly overrides: boolean;
  readonly wilaya: WilayaCode | undefined;
  /** Record identities (`ref >>> 1`) already emitted. */
  readonly seen: Set<number>;
  readonly out: Scored[];
}

/**
 * Resolve `opts.limit`, rejecting values that are not a usable count.
 *
 * `?? DEFAULT_LIMIT` alone guards `undefined` and `null` but not `NaN`, and
 * `NaN` is the value you get from `Number(req.query.limit)` when the caller
 * sent `?limit=all`. Every tier gate is `out.length < ctx.limit`, and any
 * comparison with `NaN` is `false`, so an unguarded `NaN` makes `search()`
 * return `[]` with no error and no log -- the silent-miss failure mode this
 * module exists to avoid. `Infinity` is deliberately allowed: it is a
 * meaningful "no limit". `0` is preserved as "give me nothing"; it is falsy,
 * which is why this is a `Number.isFinite` check and not `||`.
 */
function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (limit === Infinity) return limit;
  if (!Number.isFinite(limit) || limit < 0) return DEFAULT_LIMIT;
  return limit;
}

function kindMaskOf(kinds: readonly SearchKind[] | undefined): number {
  if (kinds === undefined) return ALL_KINDS;
  let mask = 0;
  for (const k of kinds) {
    // `KIND_RANK[k]` is `undefined` for a key outside the union, and
    // `1 << undefined` is `1` -- the wilaya bit. So a JavaScript caller passing
    // `["Commune"]` (wrong case) would silently get wilayas back instead of
    // nothing. Skip what we do not recognise; that also removes the implicit
    // coupling between KIND_RANK and the KIND_* constants.
    const rank = KIND_RANK[k];
    if (rank === undefined) continue;
    mask |= 1 << rank;
  }
  return mask;
}

/**
 * The owning wilaya code of a packed ref, with no allocation.
 *
 * Three array reads and a couple of shifts. This is what makes `opts.wilaya`
 * cheap enough to apply as a *prefilter*, before any string comparison.
 */
function wilayaCodeOfRef(ref: number): WilayaCode | undefined {
  const index = ref >>> 3;
  const kind = (ref >>> 1) & 3;
  if (kind === KIND_WILAYA) return wilayaList()[index]?.code;
  if (kind === KIND_DAIRA) return DAIRAS[index]?.wilaya;
  return COMMUNES[index]?.wilaya;
}

/**
 * Whether a candidate survives the kind and wilaya-scope filters.
 *
 * Called **before** the query is compared against the candidate's key, which is
 * the whole point: with `opts.wilaya` set, 2141 of the 2201 records are rejected
 * by a shift and a mask rather than by a string scan.
 *
 * Deduplication is deliberately *not* checked here. `seen` only matters for a
 * candidate that actually matched, and testing a `Set` 4402 times per query
 * costs more than the handful of duplicate emits it prevents — so the tiers test
 * it after the comparison instead, via {@link unseen}.
 */
function admitsRecord(ref: number, ctx: Ctx): boolean {
  const kind = (ref >>> 1) & 3;
  if ((ctx.kindMask & (1 << kind)) === 0) return false;
  if (ctx.wilaya !== undefined && wilayaCodeOfRef(ref) !== ctx.wilaya) return false;
  return true;
}

/**
 * The scanning tiers' candidate list: the ascending `SEARCH_KEYS` positions of
 * the scoped wilaya, or `undefined` when unscoped.
 *
 * Called from the substring and fuzzy tiers only, and only if they run at all —
 * that is what keeps {@link wilayaKeysIdx} unbuilt for a scoped query the exact
 * or prefix tier already answered.
 *
 * Positions are ascending, so a bucket walk visits keys in the same relative
 * order the sorted array would: the tie-break ordering and the determinism of a
 * truncated tier are preserved for free.
 */
function candidatesFor(ctx: Ctx): readonly number[] | undefined {
  if (ctx.wilaya === undefined) return undefined;
  const bucket = wilayaKeysIdx().get(ctx.wilaya);
  /* v8 ignore next -- the NO_INDICES arm is unreachable: all 69 wilaya codes appear in
     SEARCH_REFS (verified), so every code has a bucket. */
  return bucket === undefined ? NO_INDICES : bucket;
}

/** {@link admitsRecord} plus the language-layer filter, for keys in `SEARCH_KEYS`. */
function admits(ref: number, ctx: Ctx): boolean {
  if (ctx.langBit !== LANG_ANY && (ref & 1) !== ctx.langBit) return false;
  return admitsRecord(ref, ctx);
}

/**
 * Whether this record has not been emitted yet.
 *
 * Keyed on `ref >>> 1`, which drops the language bit: a record found through its
 * French key and again through its Arabic key is one result, not two, and the
 * first (higher-scoring) tier to reach it wins.
 */
function unseen(ref: number, ctx: Ctx): boolean {
  return !ctx.seen.has(ref >>> 1);
}

/** Resolve a packed ref to a result and collect it. */
function emit(ref: number, key: string, score: number, matched: MatchedLang, ctx: Ctx): void {
  const index = ref >>> 3;
  const kind = (ref >>> 1) & 3;
  const identity = ref >>> 1;

  if (kind === KIND_WILAYA) {
    const item = wilayaList()[index];
    /* v8 ignore next -- unreachable: `index` comes from a build-emitted packed ref, so it
       is always a valid position in WILAYAS. */
    if (item === undefined) return;
    ctx.seen.add(identity);
    ctx.out.push({ key, result: { kind: "wilaya", item, wilaya: item, score, matched } });
    return;
  }

  if (kind === KIND_DAIRA) {
    const item = DAIRAS[index];
    /* v8 ignore next -- unreachable: `index` comes from a build-emitted packed ref. */
    if (item === undefined) return;
    const owner = wilayaIdx().get(item.wilaya);
    /* v8 ignore next -- unreachable: all 69 wilayas are in the index, and every daira's
       `wilaya` is one of them. */
    if (owner === undefined) return;
    ctx.seen.add(identity);
    ctx.out.push({ key, result: { kind: "daira", item, wilaya: owner, score, matched } });
    return;
  }

  const item = COMMUNES[index];
  /* v8 ignore next -- unreachable: `index` comes from a build-emitted packed ref. */
  if (item === undefined) return;
  const owner = wilayaIdx().get(item.wilaya);
  /* v8 ignore next -- unreachable: all 69 wilayas are in the index. */
  if (owner === undefined) return;
  ctx.seen.add(identity);
  ctx.out.push({ key, result: { kind: "commune", item, wilaya: owner, score, matched } });
}

/** The language layer a packed ref's key belongs to. */
function matchedOf(ref: number): MatchedLang {
  return (ref & 1) === LANG_AR ? "ar" : "fr";
}

// ---------------------------------------------------------------------------
// Binary search
// ---------------------------------------------------------------------------

/**
 * First position in `SEARCH_KEYS` whose key is `>= target`.
 *
 * Plain `<` on strings: UTF-16 code-unit order, identical to the build-time
 * sort. Anything locale-aware here would silently break every prefix lookup.
 */
function lowerBound(target: string): number {
  let lo = 0;
  let hi = SEARCH_KEYS.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const k = SEARCH_KEYS[mid];
    if (k !== undefined && k < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// The four tiers
//
// WHY THE `limit` SHORT-CIRCUIT IS CORRECT, NOT MERELY FAST — this is the
// non-obvious invariant a future refactor will break, so it is written down
// rather than left to be rediscovered:
//
//   The tiers are ordered exact (1.0) > prefix (0.7-0.9) > substring (0.4-0.6)
//   > fuzzy (0.25-0.35), and the score bands DO NOT OVERLAP. So every result a
//   later tier could produce scores strictly below every result an earlier tier
//   has already collected. Stopping the moment the accumulator holds `limit`
//   results therefore cannot drop a result that would have outranked one already
//   in hand: the only things skipped are things that would have ranked lower.
//   Take that guarantee away — make the bands overlap, reorder the tiers, or let
//   a later tier rescore an earlier hit — and the short-circuit silently starts
//   returning wrong answers rather than merely slow ones.
//
// The guarantee is between tiers, not within one. Inside a single tier the cap
// truncates in scan order, which is the fixed sorted-key order, so the result is
// still deterministic — just not necessarily the top `limit` of that tier by
// length ratio. That is the documented cost of never scanning past `limit`.
// ---------------------------------------------------------------------------

// The exact tier is the one tier a wilaya scope cannot improve: it never walks
// the key array to begin with. One `Map` lookup yields at most a handful of key
// positions (the key `"setif"` belongs to three records), and each is filtered by
// `admitsRecord` in O(1). Walking a 162-key bucket to find them would be slower.
function tierExact(ctx: Ctx): void {
  const hits = exactIdx().get(ctx.q);
  comparisons++;
  if (hits !== undefined) {
    for (const i of hits) {
      if (ctx.out.length >= ctx.limit) return;
      const ref = SEARCH_REFS[i];
      /* v8 ignore next -- unreachable: `i` came out of the exact index, which only ever
         stores valid positions in SEARCH_KEYS / SEARCH_REFS. */
      if (ref === undefined) continue;
      if (admits(ref, ctx) && unseen(ref, ctx)) emit(ref, ctx.q, SCORE_EXACT, matchedOf(ref), ctx);
    }
  }
  if (!ctx.overrides) return;
  for (const [key, ref] of EN_OVERRIDES) {
    if (ctx.out.length >= ctx.limit) return;
    comparisons++;
    if (key !== ctx.q) continue;
    if (admitsRecord(ref, ctx) && unseen(ref, ctx)) emit(ref, key, SCORE_EXACT, "en", ctx);
  }
}

function prefixScore(q: string, key: string): number {
  return PREFIX_BASE + PREFIX_SPAN * (q.length / key.length);
}

// The prefix tier always walks the globally sorted range, scoped or not, and
// filters each hit by wilaya the same way it filters by kind.
//
// It deliberately does NOT use the wilaya bucket. Two binary searches plus a
// contiguous walk is already sublinear and is bounded by the number of prefix
// matches; a bucket walk would throw the sort order away and look at every one
// of the wilaya's ~162 keys instead. Measured on `search("ain", { wilaya: 19,
// limit: 100 })`: 101 key comparisons through the sorted range, 244 through the
// bucket. The bucket belongs to the tiers that scan, not to the tiers that seek.
function tierPrefix(ctx: Ctx): void {
  for (let i = lowerBound(ctx.q); i < SEARCH_KEYS.length; i++) {
    if (ctx.out.length >= ctx.limit) return;
    const key = SEARCH_KEYS[i];
    /* v8 ignore next -- unreachable: `i < SEARCH_KEYS.length`. */
    if (key === undefined) break;
    comparisons++;
    // The range is contiguous: the first key that does not start with `q` ends
    // it. No scan past the matches, and `limit` bounds the walk on top of that.
    if (!key.startsWith(ctx.q)) break;
    const ref = SEARCH_REFS[i];
    /* v8 ignore next -- unreachable: SEARCH_REFS is parallel to SEARCH_KEYS. */
    if (ref === undefined) continue;
    if (admits(ref, ctx) && unseen(ref, ctx)) {
      emit(ref, key, prefixScore(ctx.q, key), matchedOf(ref), ctx);
    }
  }
  if (!ctx.overrides) return;
  for (const [key, ref] of EN_OVERRIDES) {
    /* v8 ignore next -- not reached by any known input, though not structurally
       impossible. The corpus loop above carries this same guard at the top of its own
       body, so a full accumulator returns from the whole tier before reaching here.
       The only way in is for the corpus loop to end NATURALLY on the very iteration
       that filled the accumulator. That DOES happen for the exact tier -- whose guard
       is consequently not suppressed, and is covered -- but a brute-force sweep over
       the `lang:"en"` query shapes (every prefix and suffix of "alger"/"algiers",
       fuzzy on and off, limits 0..6) never reached it here. Kept, not deleted: it is
       what keeps the tier correct if EN_OVERRIDES ever grows past its one entry. */
    if (ctx.out.length >= ctx.limit) return;
    comparisons++;
    if (!key.startsWith(ctx.q)) continue;
    if (admitsRecord(ref, ctx) && unseen(ref, ctx)) {
      emit(ref, key, prefixScore(ctx.q, key), "en", ctx);
    }
  }
}

function substringScore(q: string, key: string): number {
  return SUBSTRING_BASE + SUBSTRING_SPAN * (q.length / key.length);
}

/**
 * Which language layers a substring scan can possibly match, given the query.
 *
 * This is the one tier that has to touch every key, so it is the one tier worth
 * pruning. The prune is exact for every query the corpus can actually match, but it
 * is a HEURISTIC rather than a theorem -- see the caveat below -- and it rests on two
 * properties
 * of the generated corpus, both pinned by tests:
 *
 * - **no `ar` key contains a Latin alphanumeric** (0 of 2201), so a query
 *   containing one can never be a substring of an `ar` key — the `ar` half of
 *   the array is skipped;
 * - **no `fr` key contains a non-ASCII character** (0 of 2201), so a query
 *   containing one can never be a substring of an `fr` key — the `fr` half is
 *   skipped;
 * - a query containing both matches nothing at all, and the tier is skipped
 *   entirely (`LANG_NONE`).
 *
 * ⚠️ The `ar` layer is **not** free of ASCII: 925 Arabic keys contain an ASCII
 * space and one contains an ASCII `(`. That is exactly why the loop below skips
 * `0x20` and classifies on characters rather than testing the whole string.
 * **Never replace this with a `/^[\x00-\x7f]*$/` test on the key or the query** —
 * it would misclassify those 926 keys and silently drop them from every
 * substring search.
 *
 * That halves a 4402-key scan for every real query, and it is not the
 * script-detection branch `normalize()` deliberately avoids: nothing here
 * changes how a string is folded, only which candidates cannot possibly contain
 * it.
 *
 * @param q - The normalized query.
 * @param langBit - The layer the caller already restricted to, if any.
 * @returns `LANG_FR`, `LANG_AR`, `LANG_ANY` or `LANG_NONE`.
 */
/*
 * CAVEAT, stated precisely because the paragraph above is easy to over-read:
 * `substringLangBitOf` classifies on `c < 0x80` -- ANY non-space ASCII -- which is a
 * strictly broader predicate than "contains a Latin alphanumeric". The gap is the one
 * Arabic key `"الحسيان (بني ياحي"`, which holds an ASCII `(`. A query mixing that
 * parenthesis with Arabic (`"ان (بني"`) is classified as mixed-script, so the substring
 * tier is skipped and the query returns [] even though it IS a substring of that key.
 * One commune, one unusual query shape. Do not read the "two properties" above as a
 * guarantee that the prune is sound for arbitrary punctuation -- it is not. Classifying
 * on script ranges (`[\u0600-\u06ff]` vs `[a-z0-9]`) instead would close the gap and
 * match the invariant tests/normalize.test.ts actually pins.
 */
function substringLangBitOf(q: string, langBit: number): number {
  let hasAscii = false;
  let hasWide = false;
  for (let i = 0; i < q.length; i++) {
    const c = q.charCodeAt(i);
    if (c === 0x20) continue;
    if (c < 0x80) hasAscii = true;
    else hasWide = true;
  }
  if (hasAscii && hasWide) return LANG_NONE;
  /* v8 ignore next 3 -- unreachable: `search()` returns before calling this when `q` is
     empty, and `normalize()` trims, so a non-empty `q` always has at least one non-space
     character and therefore sets `hasAscii` or `hasWide`. Kept so the function is total
     on its own terms. The arm is isolated on its own line rather than left inside the
     ternary below, because suppressing the ternary would also stop measuring the
     LANG_AR / LANG_FR arms, which decide the language layer of every substring query. */
  if (!hasAscii && !hasWide) return langBit;
  const script = hasWide ? LANG_AR : LANG_FR;
  if (langBit !== LANG_ANY && langBit !== script) return LANG_NONE;
  return script;
}

/** Test one key position for a substring hit. */
function substringAt(ctx: Ctx, i: number, langBit: number): void {
  const ref = SEARCH_REFS[i];
  /* v8 ignore next -- unreachable: `i` is a position from the wilaya bucket, which only
     holds valid positions. */
  if (ref === undefined) return;
  // Cheap filters first: a rejected candidate never reaches `includes()`.
  if (langBit !== LANG_ANY && (ref & 1) !== langBit) return;
  if (!admitsRecord(ref, ctx)) return;
  const key = SEARCH_KEYS[i];
  /* v8 ignore next -- unreachable: SEARCH_KEYS is parallel to SEARCH_REFS. */
  if (key === undefined) return;
  comparisons++;
  if (!key.includes(ctx.q)) return;
  if (!unseen(ref, ctx)) return;
  emit(ref, key, substringScore(ctx.q, key), matchedOf(ref), ctx);
}

function tierSubstring(ctx: Ctx): void {
  const langBit = ctx.substringLangBit;
  if (langBit === LANG_NONE) return;
  const candidates = candidatesFor(ctx);
  if (candidates === undefined) {
    // The one tier with no structure to exploit: every key has to be looked at.
    // Deliberately inlined rather than calling `substringAt` — this is the only
    // loop in the library that runs 4402 times per query, and hoisting `q` and
    // the array bound out of it measured ~30% faster than the call-per-key form.
    const q = ctx.q;
    const n = SEARCH_KEYS.length;
    for (let i = 0; i < n; i++) {
      if (ctx.out.length >= ctx.limit) return;
      const ref = SEARCH_REFS[i];
      /* v8 ignore next -- unreachable: `i < n === SEARCH_KEYS.length`. */
      if (ref === undefined) continue;
      if (langBit !== LANG_ANY && (ref & 1) !== langBit) continue;
      if (!admitsRecord(ref, ctx)) continue;
      const key = SEARCH_KEYS[i];
      /* v8 ignore next -- unreachable: SEARCH_KEYS is parallel to SEARCH_REFS. */
      if (key === undefined) continue;
      comparisons++;
      if (!key.includes(q)) continue;
      if (!unseen(ref, ctx)) continue;
      emit(ref, key, substringScore(q, key), matchedOf(ref), ctx);
    }
  } else {
    // Scoped: ~162 keys for Setif instead of 4402. This is where `opts.wilaya`
    // earns its description as the highest-leverage option in the API.
    for (const i of candidates) {
      if (ctx.out.length >= ctx.limit) return;
      substringAt(ctx, i, langBit);
    }
  }
  if (!ctx.overrides) return;
  for (const [key, ref] of EN_OVERRIDES) {
    /* v8 ignore next -- not reached by any known input, though not structurally
       impossible. The corpus loop above carries this same guard at the top of its own
       body, so a full accumulator returns from the whole tier before reaching here.
       The only way in is for the corpus loop to end NATURALLY on the very iteration
       that filled the accumulator. That DOES happen for the exact tier -- whose guard
       is consequently not suppressed, and is covered -- but a brute-force sweep over
       the `lang:"en"` query shapes (every prefix and suffix of "alger"/"algiers",
       fuzzy on and off, limits 0..6) never reached it here. Kept, not deleted: it is
       what keeps the tier correct if EN_OVERRIDES ever grows past its one entry. */
    if (ctx.out.length >= ctx.limit) return;
    if (!admitsRecord(ref, ctx)) continue;
    comparisons++;
    if (key.includes(ctx.q) && unseen(ref, ctx)) {
      emit(ref, key, substringScore(ctx.q, key), "en", ctx);
    }
  }
}

/**
 * How far a key may stray from the query, by query length.
 *
 * **Never taken from the caller** — a caller-supplied distance is how a search
 * box ends up returning every commune in the country.
 *
 * | Query length | maxDistance |
 * |---|---|
 * | ≤ 3 | 0 — fuzzy disabled; too many false hits on short queries |
 * | 4 – 5 | 1 |
 * | ≥ 6 | 2 |
 *
 * The naive table (≤3 → 0, 4–7 → 1, ≥8 → 2) gives `"algeirs"` a budget of 1 and
 * fails to find `Alger`, which is two edits away. That is why 2 starts at 6.
 */
function maxDistanceFor(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  return 2;
}

/**
 * Levenshtein distance between `a` and `b`, abandoned as soon as it provably
 * exceeds `max`.
 *
 * Two rolling rows, `O(min(m, n))` space — never an `(m+1) × (n+1)` matrix. Two
 * bailouts do the real work:
 *
 * 1. a length delta greater than `max` is decided by a subtraction, before any
 *    allocation;
 * 2. `rowMin > max` abandons a hopeless pair after one or two rows instead of
 *    filling the table.
 *
 * `curr[j - 1]` and `prev[j - 1]` are carried in the locals `left` and `diag`
 * rather than re-read, which is both faster and removes two of the three
 * `?? 0` fallbacks that `noUncheckedIndexedAccess` would otherwise force. (A
 * `Uint32Array` read is still typed `number | undefined` under that flag — the
 * typed array buys the speed, not the typing.)
 *
 * @param a - The normalized query.
 * @param b - A normalized corpus key.
 * @param max - The distance budget from {@link maxDistanceFor}.
 * @returns The distance, or `max + 1` to mean "further than `max`".
 */
function boundedLevenshtein(a: string, b: string, max: number): number {
  const m = a.length;
  const n = b.length;
  /* v8 ignore next -- unreachable from the two call sites, which both apply this same
     length-delta prefilter before allocating. Kept so the function is correct on its own
     terms rather than only in context. */
  if (Math.abs(m - n) > max) return max + 1;

  let prev = new Uint32Array(n + 1);
  let curr = new Uint32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    const ca = a.charCodeAt(i - 1);
    curr[0] = i;
    let left = i; // curr[j - 1], seeded with curr[0]
    let diag = i - 1; // prev[j - 1], seeded with prev[0], which is always i - 1
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      /* v8 ignore next -- the `?? 0` arm is unreachable: `j <= n` and `prev.length === n + 1`.
         A Uint32Array read is still typed `number | undefined` under noUncheckedIndexedAccess. */
      const up = prev[j] ?? 0;
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(left + 1, up + 1, diag + cost);
      curr[j] = v;
      left = v;
      diag = up;
      if (v < rowMin) rowMin = v;
    }
    // No cell in this row is within budget, so no later row can be either.
    if (rowMin > max) return max + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  /* v8 ignore next -- the `?? max + 1` arm is unreachable: `prev.length === n + 1`. */
  return prev[n] ?? max + 1;
}

/**
 * The fuzzy tier.
 *
 * Runs over a prefiltered candidate set, never over all 4402 keys:
 *
 * - **first-character bucket** — only keys whose first character equals the
 *   query's, via the free `[lo, hi)` range map;
 * - **length delta ≤ maxDistance** — a subtraction, before any allocation.
 *
 * **Stated limitation:** first-character bucketing cannot find a typo in the
 * first character. `"blger"` will not find `Alger`. This is accepted on purpose —
 * it is the cheapest possible prefilter and it cuts the candidate set by roughly
 * 20–30×.
 *
 * A distance of 0 cannot reach the scoring line: the tier only runs when the
 * accumulator is still short of `limit`, which means the exact tier ran to
 * completion, which means every key equal to the query is already in `seen` and
 * is rejected by `admits`. So the score is always in the published 0.25–0.35
 * band.
 */
/** Test one key position for a fuzzy hit, applying both prefilters. */
function fuzzyAt(ctx: Ctx, i: number, max: number, head: string): void {
  const key = SEARCH_KEYS[i];
  /* v8 ignore next -- unreachable: `i` is a valid position from a bucket range. */
  if (key === undefined) return;
  if (key.charAt(0) !== head) return;
  if (Math.abs(key.length - ctx.q.length) > max) return;
  const ref = SEARCH_REFS[i];
  /* v8 ignore next -- unreachable: SEARCH_REFS is parallel to SEARCH_KEYS. */
  if (ref === undefined) return;
  if (!admits(ref, ctx) || !unseen(ref, ctx)) return;
  comparisons++;
  const d = boundedLevenshtein(ctx.q, key, max);
  if (d > max) return;
  emit(ref, key, FUZZY_BASE - FUZZY_STEP * (d - 1), matchedOf(ref), ctx);
}

function tierFuzzy(ctx: Ctx): void {
  const max = maxDistanceFor(ctx.q.length);
  if (max === 0) return;
  const head = ctx.q.charAt(0);
  const candidates = candidatesFor(ctx);
  if (candidates === undefined) {
    const range = bucketMap().get(head);
    if (range === undefined) return;
    for (let i = range[0]; i < range[1]; i++) {
      if (ctx.out.length >= ctx.limit) return;
      fuzzyAt(ctx, i, max, head);
    }
  } else {
    // Scoped: the wilaya bucket is smaller than any first-character bucket, so
    // it replaces it. The first-character prefilter still applies, inside
    // `fuzzyAt`, which keeps the documented limitation identical either way.
    for (const i of candidates) {
      if (ctx.out.length >= ctx.limit) return;
      fuzzyAt(ctx, i, max, head);
    }
  }
  if (!ctx.overrides) return;
  for (const [key, ref] of EN_OVERRIDES) {
    /* v8 ignore next -- not reached by any known input, though not structurally
       impossible. The corpus loop above carries this same guard at the top of its own
       body, so a full accumulator returns from the whole tier before reaching here.
       The only way in is for the corpus loop to end NATURALLY on the very iteration
       that filled the accumulator. That DOES happen for the exact tier -- whose guard
       is consequently not suppressed, and is covered -- but a brute-force sweep over
       the `lang:"en"` query shapes (every prefix and suffix of "alger"/"algiers",
       fuzzy on and off, limits 0..6) never reached it here. Kept, not deleted: it is
       what keeps the tier correct if EN_OVERRIDES ever grows past its one entry. */
    if (ctx.out.length >= ctx.limit) return;
    if (key.charAt(0) !== ctx.q.charAt(0)) continue;
    if (Math.abs(key.length - ctx.q.length) > max) continue;
    if (!admitsRecord(ref, ctx) || !unseen(ref, ctx)) continue;
    comparisons++;
    const d = boundedLevenshtein(ctx.q, key, max);
    if (d > max) continue;
    emit(ref, key, FUZZY_BASE - FUZZY_STEP * (d - 1), "en", ctx);
  }
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Deterministic ordering: score descending, then `kind`, then wilaya code
 * ascending, then the normalized key ascending.
 *
 * **Never dataset order.** A tie broken by insertion order is a flaky test
 * waiting to happen and looks broken in a UI; the same query must produce the
 * same array a hundred times running.
 */
function compareScored(a: Scored, b: Scored): number {
  if (a.result.score !== b.result.score) return b.result.score - a.result.score;
  const ka = KIND_RANK[a.result.kind];
  const kb = KIND_RANK[b.result.kind];
  if (ka !== kb) return ka - kb;
  if (a.result.wilaya.code !== b.result.wilaya.code) {
    return a.result.wilaya.code - b.result.wilaya.code;
  }
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  /* v8 ignore next -- unreachable: reaching here would need two DIFFERENT records of the
     same kind, in the same wilaya, with the same normalized key. Verified 0 such pairs —
     `(wilaya, name.fr)` and `(wilaya, name.ar)` are both collision-free for communes and
     for daires — and the same record cannot appear twice because of `seen`. */
  return 0;
}

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

/**
 * Ranked multilingual search across wilayas, daïras and communes.
 *
 * Matches Arabic, French and English against a corpus normalized at build time,
 * so accents, case, apostrophes, hyphens and Arabic orthographic variants all
 * fold away: `"bejaia"`, `"Béjaïa"`, `"BEJAIA"`, `"بجاية"` and `"بجايه"` are one
 * query. Exactly one string is normalized per call — the query.
 *
 * Never throws, never returns `undefined`. An empty array is the miss,
 * consistent with every other plural lookup in the library. An empty or
 * whitespace-only query returns `[]` immediately, **before any index is built** —
 * the cheapest possible answer to the most common accidental call, an empty
 * search box on mount.
 *
 * @param query - What the user typed, in any of the three languages and any
 *   casing. Unvalidated input is fine.
 * @param opts - See {@link SearchOptions}. Defaults: all kinds, all language
 *   layers, `limit` 20, `fuzzy` off.
 * @returns Up to `limit` results, ordered by `score` descending with
 *   deterministic tie-breaks (`kind`, then wilaya code, then normalized key).
 *   Never `undefined`.
 *
 *   These are the first `limit` matches *found*, not the `limit`
 *   highest-scoring ones: the returned array is correctly ordered, but within a
 *   tier it is drawn in key order rather than by score. See the warning on
 *   {@link SearchOptions.limit} — it changes what a naive autocomplete shows.
 *
 * @example
 * ```ts
 * // The wilaya, its daira and one of its communes are all named Setif, so the
 * // kind tie-break is visible: wilaya, then daira, then commune.
 * search("setif").map((r) => r.kind);   // → ["wilaya", "daira", "commune"]
 * search("setif")[0]?.score;            // → 1.0
 * search("ain lahdjar")[0]?.item.name.fr; // → "Ain Lahdjar" (wilaya 19)
 *
 * // Accents, case and Arabic orthography all fold to the same key.
 * search("bejaia")[0]?.item.name.fr;   // → "Bejaia"  (wilaya 6), score 1.0
 * search("Béjaïa")[0]?.item.name.fr;   // → "Bejaia"
 * search("بجاية")[0]?.matched;          // → "ar"
 * search("msila")[0]?.item.name.fr;    // → "M'Sila"  (wilaya 28)
 *
 * search("ain", { wilaya: 19 }).length;             // → 13, scoped to Setif
 * search("ain", { limit: 5 }).length;               // → 5, and the scan stopped at 5
 * search("setif", { kinds: ["commune"] })[0]?.kind; // → "commune"
 *
 * // The Arabic name عين الحجر belongs to three communes in three wilayas.
 * search("عين الحجر", { kinds: ["commune"] }).map((r) => r.wilaya.code); // → [10, 19, 20]
 * // `Sidi Ameur` is both a daira and a commune in each of wilayas 32 and 64,
 * // so the unfiltered query returns four rows, not two.
 * search("sidi ameur").map((r) => r.wilaya.code);                    // → [32, 64, 32, 64]
 * search("sidi ameur", { kinds: ["commune"] }).map((r) => r.wilaya.code); // → [32, 64]
 *
 * // The one exonym in the dataset, reachable only through `lang: "en"`.
 * search("algiers", { lang: "en" })[0]?.matched;    // → "en", via the 1-entry override
 *
 * search("algier", { fuzzy: true }).map((r) => r.item.name.fr); // → ["Alger"]
 * search("algier").map((r) => r.item.name.fr);                  // → []: fuzzy is opt-in
 *
 * search("");     // → []
 * search("   ");  // → []
 * ```
 *
 * @since 2.0.0
 */
export function search(query: string, opts?: SearchOptions): readonly SearchResult[] {
  // `normalize()` is pure and allocates no index, so normalize-then-check-empty
  // is safe: the empty-query path still touches nothing.
  const q = normalize(query);
  if (q === "") return NO_RESULTS;

  const lang = opts?.lang;
  const langBit = lang === undefined ? LANG_ANY : lang === "ar" ? LANG_AR : LANG_FR;

  const ctx: Ctx = {
    q,
    limit: resolveLimit(opts?.limit),
    kindMask: kindMaskOf(opts?.kinds),
    langBit,
    substringLangBit: substringLangBitOf(q, langBit),
    overrides: lang === "en",
    wilaya: opts?.wilaya,
    seen: new Set<number>(),
    out: [],
  };

  tierExact(ctx);
  if (ctx.out.length < ctx.limit) tierPrefix(ctx);
  if (ctx.out.length < ctx.limit) tierSubstring(ctx);
  if (opts?.fuzzy === true && ctx.out.length < ctx.limit) tierFuzzy(ctx);

  ctx.out.sort(compareScored);
  return ctx.out.map((s) => s.result);
}
