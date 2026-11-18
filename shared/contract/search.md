# Search

Reference implementation: `packages/js/src/search.ts`.
Fixtures: [`shared/fixtures/search.json`](../fixtures/search.json) — every case
records the full ordered result list, scores included.

Ranked, multilingual, zero dependencies. Both packages must return the same
records, with the same scores, in the same order.

## The key index

Built from `normalize(name.fr)` and `normalize(name.ar)` for all 2176 records —
**4352 keys**, two language layers. See [`normalize.md`](normalize.md).

There is deliberately **no `en` layer**. `name.en` differs from `name.fr` for
exactly one record in the whole dataset (wilaya 16, `Alger` / `Algiers`), so a
third full layer would add 2176 keys — about a third of the index — to serve one
record. Instead `lang: "en"` searches the `fr` keys **plus** a one-entry override
table. `lang: "en"` therefore sets the language filter to `fr` *and* enables the
overrides; with no `lang` given, the overrides are not consulted at all, so a
bare `search("algiers")` correctly returns nothing.

### Ref packing

Each key carries a packed integer identifying the record it came from:

```
ref = (index << 3) | (kind << 1) | lang

  lang   bit 0      0 = fr, 1 = ar
  kind   bits 1-2   0 = wilaya, 1 = daira, 2 = commune
  index  bits 3+    position in WILAYAS / DAIRAS / COMMUNES
```

`ref >> 1` is the **record identity**, used to deduplicate: a record that
matched on both its French and Arabic name is returned once.

### Ordering

Keys are sorted ascending, tie-broken by `ref` ascending. Both halves matter:

- The sort order **is** the prefix index. No trie is built; prefix lookup is two
  binary searches over this array. The comparison used to sort and the
  comparison used to search must be the same, or every prefix lookup misses.
- The `ref` tie-break is not cosmetic. 1347 of the 4352 keys are duplicates, so
  without it the emitted order — and therefore which rows survive `limit` —
  could differ between runtimes.

## The four tiers

Evaluated strictly in order; each runs only if the previous ones came up short
of `limit`.

| Tier | Formula | Range |
|---|---|---|
| exact | `1.0` | 1.0 |
| prefix | `0.7 + 0.2 * (query.length / key.length)` | 0.7 – 0.9 |
| substring | `0.4 + 0.2 * (query.length / key.length)` | 0.4 – 0.6 |
| fuzzy | `0.35 - 0.05 * (distance - 1)` | 0.25 – 0.35 |

The bands do not overlap, which is what makes `score` meaningful as a public
number a consumer can threshold on (`[r for r in results if r.score >= 0.7]`).
It is part of the API and must stay stable across releases.

Worked: `alg` against `alger` scores `0.7 + 0.2 * 3/5 = 0.82`. `alg` against
`alger centre` scores `0.7 + 0.2 * 3/12 = 0.75`. `centre` against `alger centre`
scores `0.4 + 0.2 * 6/12 = 0.5`.

## `limit` stops the scan — and why that is correct, not just fast

`limit` (default 20) is checked between tiers **and** at the top of each tier's
loop body. It is not a `[:limit]` slice at the end.

This is safe **because the tiers are strictly ordered**: since every exact match
outranks every prefix match, and every prefix match outranks every substring
match, stopping early can never discard a result that would have outranked one
already collected. That sentence is the non-obvious invariant a future refactor
will break — it is a comment in the source for that reason.

Note what this is *not*: it is not a top-N. Within a single tier, matches are
collected in key order and sorted afterwards, so `search("ain")` returns 20 rows
scoring 0.775 down to 0.733, while `search("ain", { limit: 5000 })` returns 182
whose true top 20 all score 0.775. Both are correct; the fixture records the
former.

## Tie-break

Deterministic, never dataset order. Identical input must always produce
identical output — a flaky order is untestable and looks broken in a UI.

1. `score` **descending**
2. `kind`: wilaya (0) < daira (1) < commune (2)
3. wilaya code **ascending**
4. normalized key **ascending**

## Fuzzy

Off by default. Runs only when the first three tiers came up short, so enabling
it costs nothing on queries that already match.

`maxDistance` scales with query length and is **never taken from the caller**:

| Query length | maxDistance |
|---|---|
| ≤ 3 | 0 — disabled; too many false hits on short queries |
| 4 – 5 | 1 |
| ≥ 6 | 2 |

The jump to 2 at length **6** is deliberate and is the corrected table. The
naive version (≤3 → 0, 4–7 → 1, ≥8 → 2) gives `algeirs` a budget of 1 and fails
to find `Alger`, which is two edits away. All three of `algier` (d=1, len 6),
`alget` (d=1, len 5) and `algeirs` (d=2, len 7) must resolve to Alger; the
fixture pins all three.

### Bounded Levenshtein

Hand-rolled, zero dependencies. **No `rapidfuzz`, `python-Levenshtein`,
`jellyfish` or `unidecode`** — and specifically **not `difflib.SequenceMatcher`**,
which is Ratcliff–Obershelp similarity rather than edit distance and would give
different answers from the JS side by construction.

Two required properties:

- a **two-row rolling array**, O(min(m, n)) space, not an (m+1)×(n+1) matrix;
- an **early exit** returning `maxDistance + 1` as soon as a row's minimum
  exceeds the bound — no later row can go below it. This is what abandons a
  hopeless pair after one or two rows instead of filling the table.

A length delta greater than `maxDistance` also returns `maxDistance + 1`
immediately, before any allocation.

### Prefilters

Fuzzy runs only on prefiltered candidates, never over all 4352 keys:

- **length delta ≤ maxDistance** — a subtraction, before any allocation;
- **first-character bucket** — free, because the keys are already sorted, so the
  range for a given first character is one cached pair of offsets.

Stated limitation, accepted on purpose: first-character bucketing **cannot find a
typo in the first character**. `blger` will not find Alger. It is the cheapest
possible prefilter and it cuts the candidate set by roughly 20–30×.

## `wilaya` scoping

When `wilaya=` is given, the candidate set is resolved through the per-wilaya
index **before any key comparison**, taking the corpus from 2176 records down to
typically 10–60. One dict lookup for a 40–200× reduction. It is the
highest-leverage option in the API.

The substring and fuzzy tiers use it; the prefix tier does not — it walks the
sorted range and filters, which is already cheap.

## Contract details that are easy to get wrong

- An **empty or whitespace-only query returns an empty result immediately**,
  before any index is built. It is the most common accidental call — an empty
  search box on mount — and deserves the cheapest possible answer.
- `search` **never raises and never returns null/None**. An empty result is the
  miss.
- An **unknown `kinds` value is skipped**, not treated as `wilaya`.
- `limit: 0` returns empty; a negative or NaN limit falls back to 20.
- `fuzzy` is checked for strict `true`.

## One deliberate divergence: string wilaya codes

Python accepts `wilaya=19` **and** `wilaya="19"`, and coerces; JavaScript
accepts only the number, so `search("adrar", { wilaya: "1" })` returns nothing
there while the Python equivalent returns the three Adrar records.

This is intentional and it is the only place the two APIs answer differently.
TypeScript types the option as `WilayaCode`, so a string is a compile error and
never reaches a JS user at all. Python has no such guard, and its callers
genuinely have both forms — `19` from a form `<select>`, `"19"` from a JSON
body — so rejecting one would be friction with no safety benefit. The same
coercion is applied by every Python accessor that takes a wilaya code, so the
behaviour is at least consistent within each language.

`bool` is rejected in both languages: Python's `bool` is an `int` subclass, so
without an explicit check `wilaya=True` would silently scope to wilaya 1.

## A known bug, ported deliberately

The substring tier prunes by script: it classifies the query as Latin or Arabic
and only scans keys of that language layer. The classification tests
`charCode < 0x80`, i.e. *any* non-space ASCII, rather than "Latin alphanumeric".

One key in the corpus — `الحسيان (بني ياحي` — contains an ASCII `(`. A query
mixing that parenthesis with Arabic is therefore classified as mixed-script and
returns nothing, despite being a real substring.

**Port it as-is.** It is pinned by tests on the JS side, and "fixing" it in one
language only would break conformance. Fixing it is a change to this contract:
change both implementations and the fixtures in one commit.
