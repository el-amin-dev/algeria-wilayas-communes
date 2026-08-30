/**
 * The ONE normalization function.
 *
 * `scripts/build-data.ts` imports this exact module to normalize the corpus at
 * build time into `generated/search-keys.ts`; `search.ts` imports it to
 * normalize the query at run time. There is deliberately no second copy and no
 * re-implementation in the script: if the two ever drift, every lookup misses
 * silently, with no error and no failing type. `tests/normalize.test.ts`
 * re-derives the whole key set from the records and asserts it byte-for-byte
 * against the generated array, which is the only way that drift can be caught.
 *
 * This is also the ONLY file under `packages/js/src/` allowed to call
 * `.toLowerCase()` or `.normalize("NFD")`. v1's defect was calling them on 1541
 * corpus strings per query; keeping them confined to this module makes
 * `grep -rn "toLowerCase" packages/js/src/` a standing proof that corpus
 * normalization has not leaked back into the runtime. One string is normalized
 * per `search()` call: the query.
 *
 * Both rule sets are applied unconditionally, with no script detection. The
 * Latin rules are no-ops on Arabic text and the Arabic rules are no-ops on
 * Latin text, so a detection branch would buy nothing and add one more thing
 * that can disagree between build and run time.
 *
 * The output is an INTERNAL INDEX KEY. It is never displayed — display always
 * comes from the original `name.ar` / `name.fr`.
 */

/**
 * Combining marks removed after NFD, as one class. The range is wider than the
 * Latin block on purpose, and the reason is the single most subtle thing in
 * this file:
 *
 * - `U+0300..U+036F` — Latin combining marks. This is what turns `é` into `e`
 *   and `ï` into `i`.
 * - `U+064B..U+0652` — Arabic tashkeel / harakat: fatha, damma, kasra, sukun,
 *   shadda and the tanween forms.
 * - `U+0653..U+0655` — maddah and the hamzas above/below. These are NOT typed
 *   by anyone: they are what NFD *produces*. `أ` (U+0623) decomposes to
 *   `ا` + U+0654, `آ` to `ا` + U+0653, `إ` to `ا` + U+0655, `ؤ` (U+0624) to
 *   `و` + U+0654 and `ئ` (U+0626) to `ي` + U+0654.
 *
 *   So NFD plus this range already performs the alef-unification and the
 *   hamza-carrier folding, and it performs them on decomposed input too. A
 *   rule list that ran `replace(/[أإآ]/g, "ا")` *after* NFD would be a silent
 *   no-op — the precomposed characters it looks for no longer exist by then —
 *   and would leave a stray U+0654 in the key, which nothing displays and no
 *   type catches.
 * - `U+0670` — superscript (dagger) alef, which appears in fully-vocalized
 *   spellings and is a diacritic, not a letter.
 */
const COMBINING_MARKS = /[\u0300-\u036f\u064b-\u0655\u0670]/g;

/** Tatweel / kashida (U+0640) — pure elongation, carries no meaning. */
const TATWEEL = /\u0640/g;

/**
 * The three Arabic letters that have no canonical decomposition, so NFD cannot
 * fold them and they need an explicit map.
 *
 * - `ٱ` (U+0671, alef wasla) → `ا` (U+0627).
 * - `ى` (U+0649, alef maqsura) → `ي` (U+064A).
 * - `ة` (U+0629, ta marbuta) → `ه` (U+0647).
 *
 * The last two are LOSSY, on purpose. `بجاية` normalizes to `بجايه`, which is
 * not how the word is spelled. It is done anyway because users on phone
 * keyboards routinely type `ه` where the orthography wants `ة`, and both have
 * to find the same record. The same reasoning covers `ى → ي`. The cost is a
 * few extra collisions between genuinely different words, which is acceptable
 * because the collision resolution is "return both and let the score sort
 * them".
 */
const ARABIC_LETTER_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\u0671/g, "\u0627"],
  [/\u0649/g, "\u064a"],
  [/\u0629/g, "\u0647"],
];

/**
 * Apostrophes, ASCII `'` (U+0027) and typographic `’` (U+2019).
 *
 * REMOVED, never replaced with a space: `M'Sila` is one word, and `msila` is
 * how people actually type it. `m sila` would match nothing anyone types.
 */
const APOSTROPHES = /['\u2019]/g;

/** Hyphens and underscores become a single space, so `Abi-Youcef` matches `abi youcef`. */
const WORD_SEPARATORS = /[-_]/g;

/** Runs of any whitespace collapse to one space. */
const WHITESPACE_RUNS = /\s+/g;

/**
 * Fold a name or a query to its search key.
 *
 * @param value - Any name or query string, in Arabic, French or English.
 * @returns The normalized key: lowercase, unaccented, apostrophe-free, with
 *   Arabic orthographic variants unified and whitespace collapsed. Never
 *   `null`; an all-punctuation input yields `""`.
 *
 * @example
 * ```ts
 * normalize("Béjaïa")          // → "bejaia"
 * normalize("بجاية")            // → "بجايه"
 * normalize("M'Sila")          // → "msila"
 * normalize("الجزائر الوسطى")   // → "الجزاير الوسطي"
 * normalize("  Tizi-Ouzou  ")  // → "tizi ouzou"
 * ```
 *
 * @since 2.0.0
 */
export function normalize(value: string): string {
  let out = value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(TATWEEL, "");

  for (const [pattern, replacement] of ARABIC_LETTER_FOLDS) {
    out = out.replace(pattern, replacement);
  }

  return out
    .replace(APOSTROPHES, "")
    .replace(WORD_SEPARATORS, " ")
    .replace(WHITESPACE_RUNS, " ")
    .trim();
}
