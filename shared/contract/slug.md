# The slug rule

Slugs exist for one purpose: minting record ids from `nom_fr`. They are not the
search normalizer — that is a different, larger problem with different rules
(see [`normalize.md`](normalize.md)). The two are easy to conflate and must not
be, because they disagree on two points: an existing hyphen **survives** a slug
and becomes a **space** in a normalized key, and a slug drops every character
outside `[a-z0-9-]` while a key keeps Arabic.

Reference implementation: `slug()` in `scripts/build-data.ts`.
Fixtures: [`shared/fixtures/slug.json`](../fixtures/slug.json), plus
[`ids.json`](../fixtures/ids.json), which is the exhaustive proof — all 2126 ids
are produced through this function.

## The steps, in order

Order is load-bearing. Applying the same steps in a different order gives
different answers on real records.

1. **Lowercase.**
2. **NFD normalize**, then delete every character in `U+0300`–`U+036F`
   (combining diacritical marks). This is what turns `é` into `e` and `ï` into
   `i`.
3. **Delete apostrophes** — ASCII `'` (`U+0027`) and typographic `’`
   (`U+2019`). Deleted, never replaced with a separator.
4. **Runs of whitespace become `-`.** Whitespace only. Not hyphens, not
   underscores, not punctuation.
5. **Delete every character that is not `[a-z0-9-]`.**
6. **Collapse runs of `-` into one.**
7. **Trim leading and trailing `-`.**

## Why step 3 deletes rather than hyphenates

`M'Sila` becomes `msila`, not `m-sila`. `Sidi M'hamed` becomes `sidi-mhamed`,
not `sidi-m-hamed`. The apostrophe in these names is not a word boundary — the
name is one word, and `msila` is how people type it. Hyphenating produces ids
that no one would guess and that do not match the search key either.

## Why step 5 exists, and why it is the step that gets lost

This is the step most likely to be dropped by someone reimplementing the rule
from a prose description, because a natural-language summary reads as
"lowercase, strip accents, drop apostrophes, turn separators into hyphens,
collapse, trim" — which is steps 1, 2, 3, 4, 6, 7, and produces the wrong answer
for two real records:

| Record | Without step 5 | Correct |
|---|---|---|
| `B. B. Arreridj` | `b.-b.-arreridj` | `b-b-arreridj` |
| `Z'barbar (El Isseri )` | `zbarbar-(el-isseri-)` | `zbarbar-el-isseri` |

Two ids out of 2126. Nothing crashes, no test in either package fails on its own,
and a consumer joining the two datasets on `id` gets two silent mismatches. That
is precisely the failure the fixtures exist to prevent, and both cases are pinned
in `slug.json` and asserted by name in `tests/shared-fixtures.test.ts`.

Note also that step 5 runs **after** step 4. Whitespace has already become `-` by
then, so a legitimate separator survives while punctuation does not.

## Worked examples

All real records.

| Input | Slug | Shows |
|---|---|---|
| `Sidi M'hamed` | `sidi-mhamed` | apostrophe deleted |
| `M'Sila` | `msila` | apostrophe deleted, one word |
| `Abi-Youcef` | `abi-youcef` | an existing hyphen survives |
| `Alger Centre` | `alger-centre` | space becomes `-` |
| `Bordj Bou Arreridj` | `bordj-bou-arreridj` | multiple spaces |
| `Béjaïa` | `bejaia` | NFD + mark strip |
| `Aïn Témouchent` | `ain-temouchent` | NFD + mark strip |
| `B. B. Arreridj` | `b-b-arreridj` | **full stops dropped, not separators** |
| `Z'barbar (El Isseri )` | `zbarbar-el-isseri` | **parens dropped, trailing `-` trimmed** |
| `Ain Azel` | `ain-azel` | the canonical example (ADR-006) |

## A slug must never be empty

`slug()` strips everything outside `[a-z0-9-]`, so a name with no Latin letters
at all — an Arabic string mistakenly entered in a `nom_fr` field, say — reduces
to `""`. That would mint ids like `09-` and `09--x` and ship them with the build
still exiting 0. Assertion **A20** in `scripts/build-data.ts` fails the build
instead. Any reimplementation used to mint ids should carry the same check.
