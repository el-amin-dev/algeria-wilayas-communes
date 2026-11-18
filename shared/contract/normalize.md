# The normalization rule

One function, applied to two things: every name in the corpus at index-build
time, and the query at search time. If the two ever use different rules, every
lookup silently misses — no error, no failing type, no crash. That is why there
is exactly one implementation per language and why both are pinned by fixtures.

Reference implementation: `normalize()` in `packages/js/src/normalize.ts`.
Fixtures: [`shared/fixtures/normalize.json`](../fixtures/normalize.json).

The output is an **internal index key**. It is never displayed. Display always
comes from the original `name.ar` / `name.fr`.

## The steps, in order

Both rule sets are applied unconditionally, with **no script detection**. A
query can mix scripts, and branching on "is this Arabic?" would be one more
thing to get wrong in two languages.

1. **Lowercase.**
2. **NFD normalize**, then delete every character in these ranges:
   - `U+0300`–`U+036F` — Latin combining marks (`é` → `e`, `ï` → `i`)
   - `U+064B`–`U+0652` — Arabic tashkeel/harakat: fatha, damma, kasra, sukun,
     shadda, and the tanween forms
   - `U+0653`–`U+0655` — maddah and the hamzas above/below
   - `U+0670` — superscript (dagger) alef, a diacritic rather than a letter
3. **Delete tatweel** `U+0640` — the kashida, pure elongation, carries no
   meaning.
4. **Three explicit letter folds**, for the letters that have no canonical
   decomposition and so cannot be handled by step 2:
   - `U+0671` (alef wasla) → `U+0627` (bare alef)
   - `U+0649` (alef maqsura) → `U+064A` (ya)
   - `U+0629` (ta marbuta) → `U+0647` (ha)
5. **Delete apostrophes** — `U+0027` and `U+2019`.
6. **Hyphen and underscore become a space.**
7. **Collapse runs of whitespace to one space**, then trim.

## The trap in step 2, stated plainly

**The alef and hamza-carrier folds are not in the explicit list, and must not
be added to it.**

NFD decomposes the precomposed Arabic letters:

| Character | NFD decomposition |
|---|---|
| `أ` `U+0623` | `ا` `U+0627` + `U+0654` |
| `إ` `U+0625` | `ا` `U+0627` + `U+0655` |
| `آ` `U+0622` | `ا` `U+0627` + `U+0653` |
| `ؤ` `U+0624` | `و` `U+0648` + `U+0654` |
| `ئ` `U+0626` | `ي` `U+064A` + `U+0654` |

So step 2's `U+0653`–`U+0655` strip *already* performs alef unification and
hamza-carrier folding — and performs them on input that arrived decomposed, too.

A rule list that adds `replace(/[أإآ]/g, "ا")` **after** NFD is a silent no-op:
the precomposed characters it looks for no longer exist by then. Worse, it reads
like it is doing the work, so the missing behaviour is invisible in review. If
step 2 were then also written wrongly, the fold would be gone entirely and every
Arabic query typed with a hamza would miss.

`normalize.json` asserts these equivalences directly, in both suites.

## Steps 4b and 4c are lossy, on purpose

Folding ta marbuta to ha means `بجاية` normalizes to `بجايه`, which is not how
the word is spelled. Folding alef maqsura to ya does the same to `الوسطى`.

Do it anyway. Users on phone keyboards routinely type `ه` where the orthography
wants `ة`, and `ي` where it wants `ى`, and both spellings must find the same
record. Since the normalized form is only ever an index key, nothing incorrect
is ever shown to anyone. The cost is a few extra collisions between genuinely
different words, which is fine — collision resolution is "return both and let
the score sort them".

## Where this differs from `slug()`

| | `slug()` | `normalize()` |
|---|---|---|
| Purpose | mint ids | search keys |
| Apostrophe | deleted | deleted |
| Existing hyphen | **survives** as `-` | becomes a **space** |
| Whitespace | becomes `-` | collapses to one space |
| Arabic | **deleted** (outside `[a-z0-9-]`) | kept and folded |
| Tashkeel/tatweel | n/a | stripped |

## Worked examples

| Input | Output |
|---|---|
| `Béjaïa` | `bejaia` |
| `M'Sila` | `msila` |
| `Abi-Youcef` | `abi youcef` |
| `  Tizi-Ouzou  ` | `tizi ouzou` |
| `بجاية` | `بجايه` |
| `بَجَايَة` (vocalized) | `بجايه` |
| `بجـاية` (with kashida) | `بجايه` |
| `الجزائر الوسطى` | `الجزاير الوسطي` |
| `أدرار` / `إدرار` / `آدرار` / `ٱدرار` | `ادرار` |
| `   ` | `` (empty) |

## The key set

The corpus is normalized once at build time into `SEARCH_KEYS`: `name.fr` and
`name.ar` for all 2195 records = **4390 keys**, of which **3055 are distinct**.
`normalize.json` records both counts plus a SHA-256 of the sorted keys joined on
`\n`, so a second implementation can prove its whole key set matches without
shipping a second copy of it. See [`search.md`](search.md) for the ordering and
the ref packing.
