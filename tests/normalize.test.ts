/**
 * `normalize()` — the worked-example table, and the anti-drift proof.
 *
 * The second half of this file is the most valuable test in the session, and it
 * is worth saying why in full.
 *
 * `scripts/build-data.ts` normalizes the whole corpus at build time and emits
 * the result as `generated/search-keys.ts`. `search.ts` normalizes exactly one
 * string per call at run time: the query. Those are two executions of the same
 * function at two different times, and the entire search feature is the
 * assumption that they agree. If they ever stop agreeing — a rule added to
 * `normalize.ts` without a rebuild, a rebuild from a modified `normalize.ts`,
 * an NFD change under a Node upgrade — then EVERY lookup silently misses.
 * There is no error, no type failure, no exception; `search("bejaia")` simply
 * returns `[]` and looks like a data problem. Nothing else in the test suite
 * can catch that, because every other search test would also just go quiet.
 *
 * So this file re-derives all 4390 keys from `WILAYAS` / `DAIRAS` / `COMMUNES`
 * using the runtime `normalize()` and the documented ref packing, sorts them the
 * documented way, and asserts byte-for-byte equality with the generated arrays.
 */

import { describe, expect, it } from "vitest";

import { COMMUNES } from "../packages/js/src/generated/communes";
import { DAIRAS } from "../packages/js/src/generated/dairas";
import { EN_OVERRIDES, SEARCH_KEYS, SEARCH_REFS } from "../packages/js/src/generated/search-keys";
import { WILAYAS } from "../packages/js/src/generated/wilayas";
import { normalize } from "../packages/js/src/normalize";

// ── The worked examples ─────────────────────────────────────────────────────

describe("normalize — the worked examples from the spec", () => {
  it.each<[string, string]>([
    // The canonical anchors first. `Sétif` is the accented spelling a French
    // keyboard produces and it appears NOWHERE in the dataset — the record is
    // `Setif`. Both have to reach the same key or half the country's users miss
    // their own wilaya.
    ["Setif", "setif"],
    ["Sétif", "setif"],
    ["SÉTIF", "setif"],
    ["سطيف", "سطيف"],
    ["Ain Lahdjar", "ain lahdjar"],
    ["Aïn Lahdjar", "ain lahdjar"],
    ["Ain-Lahdjar", "ain lahdjar"],
    ["عين الحجر", "عين الحجر"],
    // Alef with hamza above decomposes under NFD and the mark is stripped, so
    // `أ` folds to bare `ا` without any explicit replacement rule.
    ["عين أزال", "عين ازال"],

    // Latin: lowercase, NFD, strip combining marks.
    ["Béjaïa", "bejaia"],
    ["bejaïa", "bejaia"],
    ["BEJAIA", "bejaia"],
    ["Aïn Témouchent", "ain temouchent"],
    // Apostrophes are DELETED, never replaced by a space: `M'Sila` is one word
    // and `msila` is how people type it. `m sila` would match nothing.
    ["M'Sila", "msila"],
    ["Sidi M'hamed", "sidi mhamed"],
    ["Hassi R'mel", "hassi rmel"],
    // Typographic apostrophe, the one a phone keyboard actually inserts.
    ["M’Sila", "msila"],
    // Hyphens and underscores BECOME a space, which is the asymmetry with the
    // apostrophe rule and the reason the two are separate steps.
    ["Abi-Youcef", "abi youcef"],
    ["Tizi-Ouzou", "tizi ouzou"],
    ["Tizi Ouzou", "tizi ouzou"],
    ["  Tizi-Ouzou  ", "tizi ouzou"],
    ["Alger Centre", "alger centre"],
    ["Bordj Bou Arreridj", "bordj bou arreridj"],

    // Arabic: ta marbuta → ha (lossy on purpose — phone keyboards),
    // alef maqsura → ya, hamza carriers folded by NFD + mark stripping.
    ["بجاية", "بجايه"],
    ["المسيلة", "المسيله"],
    ["الجزائر الوسطى", "الجزاير الوسطي"],
    ["تيزي وزو", "تيزي وزو"],
    ["برج بوعريريج", "برج بوعريريج"],
  ])("normalize(%o) === %o", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it("is idempotent — normalizing a key changes nothing", () => {
    // The build normalizes names; the runtime normalizes queries. A user who
    // pastes a normalized key back in must land on the same record.
    const bad: string[] = [];
    for (const value of [
      "Sétif",
      "عين الحجر",
      "Béjaïa",
      "بجاية",
      "M'Sila",
      "الجزائر الوسطى",
      "  Tizi-Ouzou  ",
    ]) {
      const once = normalize(value);
      if (normalize(once) !== once) bad.push(`${value}: ${once} -> ${normalize(once)}`);
    }
    expect(bad).toEqual([]);
  });

  it("returns the empty string for an empty or punctuation-only input", () => {
    // Never `null`, never a throw. `search()` leans on this to bail out before
    // touching an index.
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
    expect(normalize("\t\n ")).toBe("");
    expect(normalize("'''")).toBe("");
    expect(normalize("---")).toBe("");
  });

  it("folds the query that the dataset itself never contains", () => {
    // There is not one accented Latin character in the shipped names — the
    // records are `Setif` and `Bejaia`. Both spellings still have to reach the
    // same key, and that is entirely the query side's job.
    expect(normalize("Sétif")).toBe(normalize("Setif"));
    expect(normalize("Béjaïa")).toBe(normalize("Bejaia"));
    expect(normalize("بجاية")).toBe(normalize("بجايه"));
    expect(normalize("الجزائر الوسطى")).toBe(normalize("الجزاير الوسطي"));
  });
});

// ── The anti-drift proof ────────────────────────────────────────────────────

/**
 * The documented ref packing, written out here rather than imported, so this
 * test is an INDEPENDENT statement of the format:
 *
 *     ref = (index << 3) | (kind << 1) | lang
 *     lang   bit 0      0 = fr, 1 = ar
 *     kind   bits 1..2  0 = wilaya, 1 = daira, 2 = commune
 *     index  bits 3..   position in WILAYAS / DAIRAS / COMMUNES
 *
 * If the emitter changes the layout, this disagrees. If this file imported a
 * shared packing helper instead, both sides would change together and the test
 * would keep passing while every consumer's refs pointed at the wrong records.
 */
function pack(index: number, kind: 0 | 1 | 2, lang: 0 | 1): number {
  return (index << 3) | (kind << 1) | lang;
}

/** Re-derive every key/ref pair from the records, in the generated order. */
function rebuildKeysFromCorpus(): { keys: string[]; refs: number[] } {
  const rows: { key: string; ref: number }[] = [];

  WILAYAS.forEach((w, i) => {
    rows.push({ key: normalize(w.name.fr), ref: pack(i, 0, 0) });
    rows.push({ key: normalize(w.name.ar), ref: pack(i, 0, 1) });
  });
  DAIRAS.forEach((d, i) => {
    rows.push({ key: normalize(d.name.fr), ref: pack(i, 1, 0) });
    rows.push({ key: normalize(d.name.ar), ref: pack(i, 1, 1) });
  });
  COMMUNES.forEach((c, i) => {
    rows.push({ key: normalize(c.name.fr), ref: pack(i, 2, 0) });
    rows.push({ key: normalize(c.name.ar), ref: pack(i, 2, 1) });
  });

  // Sorted ascending by UTF-16 code unit — that order IS the prefix index, and
  // two binary searches over it answer a prefix query. Ties broken by ref, so
  // the order is total and the emitter has nothing left to choose.
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.ref - b.ref));

  return { keys: rows.map((r) => r.key), refs: rows.map((r) => r.ref) };
}

describe("normalize — build-time and run-time cannot drift", () => {
  it("re-derives SEARCH_KEYS from the corpus, byte for byte", () => {
    expect(rebuildKeysFromCorpus().keys).toEqual([...SEARCH_KEYS]);
  });

  it("re-derives SEARCH_REFS from the corpus, byte for byte", () => {
    expect(rebuildKeysFromCorpus().refs).toEqual([...SEARCH_REFS]);
  });

  it("has 4390 keys — 2195 records × (fr + ar) — and 3055 distinct ones", () => {
    // 69 + 585 + 1541 = 2195 records, two language layers each. The distinct
    // count is far lower because a wilaya, its seat daïra and its seat commune
    // usually share a name: `bejaia` appears three times in the fr layer alone.
    // That collapse is expected and is why every key carries its own ref.
    expect(SEARCH_KEYS).toHaveLength(4390);
    expect(SEARCH_REFS).toHaveLength(4390);
    expect(new Set(SEARCH_KEYS).size).toBe(3055);
  });

  it("is sorted ascending, with no key out of order", () => {
    const outOfOrder: string[] = [];
    for (let i = 1; i < SEARCH_KEYS.length; i++) {
      const prev = SEARCH_KEYS[i - 1];
      const curr = SEARCH_KEYS[i];
      if (prev === undefined || curr === undefined) continue;
      if (prev > curr) outOfOrder.push(`${i}: ${prev} > ${curr}`);
    }
    expect(outOfOrder).toEqual([]);
  });

  it("has no empty key — every record contributes two usable keys", () => {
    expect(SEARCH_KEYS.filter((k) => k.length === 0)).toEqual([]);
  });

  it("keeps the two language layers disjoint by script", () => {
    // LOAD-BEARING, and pinned nowhere else. The runtime prunes the substring
    // tier by language layer, and that pruning is only correct because the two
    // layers cannot overlap: a query containing a Latin letter can only match
    // an `fr` key, a query containing an Arabic letter can only match an `ar`
    // key. If that ever stopped holding, substring search would silently stop
    // matching — no error, no failing type, just fewer results.
    //
    // Stated precisely, because the loose version of this claim is WRONG:
    // "no `ar` key contains any ASCII" is false. 925 of them contain the ASCII
    // SPACE, and one — `الحسيان (بني ياحي` — contains an ASCII `(`. Anyone
    // pruning with `/^[\x00-\x7f]*$/` would break on those. The true property
    // is about LETTERS and DIGITS, and that is what is asserted here.
    const frWithArabic: string[] = [];
    const frWithNonAscii: string[] = [];
    const arWithLatin: string[] = [];
    const arWithoutArabic: string[] = [];
    let frSeen = 0;
    let arSeen = 0;

    SEARCH_KEYS.forEach((key, i) => {
      const ref = SEARCH_REFS[i];
      if (ref === undefined) return;
      if ((ref & 1) === 0) {
        frSeen += 1;
        if (/[\u0600-\u06ff]/.test(key)) frWithArabic.push(key);
        // eslint-disable-next-line no-control-regex -- the range IS the assertion
        if (/[^\u0000-\u007f]/.test(key)) frWithNonAscii.push(key);
      } else {
        arSeen += 1;
        if (/[a-z0-9]/.test(key)) arWithLatin.push(key);
        if (!/[\u0600-\u06ff]/.test(key)) arWithoutArabic.push(key);
      }
    });

    // Assert the SAMPLE first. Without this, every assertion below would pass
    // vacuously if the lang bit stopped being read correctly and one layer came
    // out empty — the strongest way to break this test is to make it inspect
    // nothing.
    expect(frSeen).toBe(2195);
    expect(arSeen).toBe(2195);

    expect(frWithArabic).toEqual([]);
    // The `fr` layer really is pure ASCII — normalization has stripped every
    // accent, so `é` cannot reach a key.
    expect(frWithNonAscii).toEqual([]);
    expect(arWithLatin).toEqual([]);
    expect(arWithoutArabic).toEqual([]);
  });

  it("has no key at all starting with p, q, u, v, w or x", () => {
    // The fuzzy tier ranges over a first-character bucket map built from this
    // array, so the set of FIRST characters is the set of buckets that exist.
    // Six Latin letters and every digit are absent, which is why
    // `search("qqqqqq", { fuzzy: true })` returns [] without computing a single
    // edit distance — asserted from the other side in tests/search.test.ts.
    //
    // Note this is a different claim from the character-set test below: `x`
    // occurs INSIDE keys, just never at the front.
    const firstChars = new Set<string>();
    SEARCH_KEYS.forEach((key, i) => {
      const ref = SEARCH_REFS[i];
      if (ref === undefined || (ref & 1) !== 0) return;
      firstChars.add(key.charAt(0));
    });
    expect([...firstChars].sort().join("")).toBe("abcdefghijklmnorstyz");
    for (const absent of ["p", "q", "u", "v", "w", "x", "0", "9"]) {
      expect(firstChars.has(absent), `expected no fr key to start with ${absent}`).toBe(false);
    }
  });

  it("uses only a small, closed character set in the fr layer", () => {
    // The whole `fr` alphabet after normalization: lowercase a-z, space, and
    // the three punctuation marks that survive it — `.` and the parentheses in
    // names like `b. b. arreridj`. No digits, no hyphens (they became spaces),
    // no apostrophes (they were deleted). A new character appearing here means
    // a normalization rule changed.
    const chars = new Set<string>();
    SEARCH_KEYS.forEach((key, i) => {
      const ref = SEARCH_REFS[i];
      if (ref === undefined || (ref & 1) !== 0) return;
      for (const ch of key) chars.add(ch);
    });
    expect([...chars].sort().join("")).toBe(" ().abcdefghijklmnoprstuwxyz");
  });

  it("packs refs that resolve back to a record of the right kind", () => {
    // Unpack every ref and check the layer bounds. A ref whose index runs past
    // its array is the failure mode of an off-by-one in the packing shift, and
    // it would show up to a user as a random commune in the results.
    const bad: string[] = [];
    for (const ref of SEARCH_REFS) {
      const kind = (ref >> 1) & 3;
      const index = ref >> 3;
      const size = kind === 0 ? WILAYAS.length : kind === 1 ? DAIRAS.length : COMMUNES.length;
      if (kind > 2) bad.push(`ref ${ref}: kind ${kind}`);
      else if (index >= size) bad.push(`ref ${ref}: index ${index} >= ${size}`);
    }
    expect(bad).toEqual([]);
  });

  it("has exactly one English override, and it is Algiers for wilaya 16", () => {
    // `name.en` differs from `name.fr` for exactly one record in the whole
    // dataset, so there is no `en` key layer at all — 2195 duplicate keys saved.
    // A second override slipping in, or this one being lost, both change the
    // meaning of `lang: "en"` silently.
    expect(EN_OVERRIDES).toHaveLength(1);
    expect(EN_OVERRIDES.map(([key, ref]) => [key, ref])).toEqual([["algiers", 120]]);

    const [override] = EN_OVERRIDES;
    expect(override).toBeDefined();
    if (override !== undefined) {
      const [key, ref] = override;
      expect(key).toBe(normalize("Algiers"));
      expect(ref & 1).toBe(0); // lang bit: the fr layer, which `en` aliases
      expect((ref >> 1) & 3).toBe(0); // kind bits: a wilaya
      expect(WILAYAS[ref >> 3]?.code).toBe(16);
      expect(WILAYAS[ref >> 3]?.name.en).toBe("Algiers");
    }
  });

  it("carries no separate `en` key layer", () => {
    // `algiers` is reachable only through EN_OVERRIDES. If someone "fixes" the
    // build by emitting a third layer, SEARCH_KEYS gains 2195 entries and this
    // fails before the length assertion does.
    expect(SEARCH_KEYS.filter((k) => k === "algiers")).toEqual([]);
  });
});
