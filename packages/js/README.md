# algeria-wilayas-communes

Algeria's administrative divisions — wilayas, daïras and communes — as a typed, zero-dependency npm package with Arabic, French and English names and postal codes.

[![npm](https://img.shields.io/npm/v/algeria-wilayas-communes)](https://www.npmjs.com/package/algeria-wilayas-communes)
[![gzip](https://img.shields.io/badge/gzip-2.36%20kB%20%C2%B7%2096.92%20kB-blue)](#bundle-size-and-performance)
[![dependencies](https://img.shields.io/badge/dependencies-0-blue)](#bundle-size-and-performance)
[![types](https://img.shields.io/badge/types-included-blue)](#api)
[![license](https://img.shields.io/badge/license-CC0--1.0-blue)](https://github.com/el-amin-dev/algeria-wilayas-communes/blob/main/LICENSE)
[![CI](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml/badge.svg)](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/npm-provenance%20attested-blue)](https://www.npmjs.com/package/algeria-wilayas-communes)
[![verified](https://img.shields.io/badge/verified-2026--07--20-blue)](#provenance-gaps-and-the-reform)

**69 wilayas, 1541 communes. Updated for Loi 26-06 (April 2026).** Most Algeria datasets still ship the 1984 or 2019 map.

Through 2026 both maps are legally real, so the package answers from the 69-wilaya map by default and keeps the 58-wilaya view behind an explicit `asOf` flag. It runs anywhere JavaScript runs — browser, Vite, Next.js, Cloudflare Workers, Deno, Bun, React Native — because nothing in it touches the filesystem.

## Install

```bash
npm  install algeria-wilayas-communes
pnpm add     algeria-wilayas-communes
yarn add     algeria-wilayas-communes
bun  add     algeria-wilayas-communes
```

## Thirty seconds

A customer types a postal code. 38 of the 1476 distinct codes are shared by more than one commune, so the answer is an array — treat it as one.

```js
import { findByPostalCode, getWilaya } from "algeria-wilayas-communes/communes";

const matches = findByPostalCode("19046"); // whatever the customer typed

if (matches.length === 0) {
  console.log("No commune uses that postal code.");
} else if (matches.length === 1) {
  console.log(`${matches[0].name.fr}, ${getWilaya(matches[0].wilaya)?.name.fr}`);
} else {
  // 17 codes are shared — ask, never guess
  console.log(matches.map((c) => `${c.name.fr} (${getWilaya(c.wilaya)?.name.fr})`));
}
// → [ 'El-Ouldja (Setif)', 'El Oueldja (Khenchela)', 'El Ouldja (Relizane)' ]
```

## Bundle size and performance

Measured on this checkout with `size-limit` (minified + gzipped, all dependencies included), Node v22.18.0, linux-x64.

| Entry point | gzip |
|---|---|
| `algeria-wilayas-communes/wilayas` | **2.36 kB** |
| `algeria-wilayas-communes/dairas` | 16.66 kB |
| `algeria-wilayas-communes/communes` | 64.80 kB |
| `algeria-wilayas-communes/zod` | 48.93 kB |
| `algeria-wilayas-communes/legacy` | 64.97 kB |
| `algeria-wilayas-communes` (root, full API) | 96.92 kB |
| `algeria-wilayas-communes` (root, `getWilayas` only) | 64.73 kB |

**Tree-shaking will not save you at the root.** Importing nothing but `getWilayas` from the root still costs 64.73 kB, because `api.ts`'s `getWilayas(opts?)` calls `wantsLegacyView` from `asof.ts`, and `asof.ts` imports `generated/communes` unconditionally. The reference is in the module graph even though the call is conditional, so no bundler may drop it. `/wilayas` is 2.36 kB. That 27x gap is the entire reason the metadata split exists — a real Vite production build of a wilaya `<select>` is 2417 B gzip against a 96 959 B full-API control, 40.1x smaller.

**Do not mix entry points.** Each subpath is a self-contained bundle, so importing two of them ships the dataset twice. Their records are deeply equal but not `===`: `getWilaya(19)` from `/wilayas` is a different object from `getWilaya(19)` at the root. Lookups by `id` or `code` behave identically; a `Set` or `Map` keyed by the record itself sees two. Pick one entry per application.

### v1 versus v2, honestly

Cold path — 15 fresh processes per cell, milliseconds, import and first call reported separately because v1 and v2 pay the cost in different places:

| op | v1 import | v1 first call | **v1 total** | v2 import | v2 first call | **v2 total** |
|---|---|---|---|---|---|---|
| `getWilayas` | 2.29 | 0.15 | **2.44** | 7.84 | 0.12 | **7.96** |
| `getCommunes` | 2.05 | 3.42 | **5.47** | 8.15 | 0.06 | **8.20** |
| `getAll` | 2.20 | 2.01 | **4.21** | 7.89 | 1.47 | **9.36** |
| `findByPostalCode` | 2.02 | 3.62 | **5.64** | 8.29 | 0.40 | **8.69** |
| `findCommune` | 2.06 | 4.07 | **6.13** | 8.20 | 1.34 | **9.54** |

**v2's cold path is slower than v1's in every row**, and worst where v1 was fastest. v1 read a small JSON file with `readFileSync` and handed it to `JSON.parse`; v2 inlines the data as TypeScript literals so it can run without a filesystem, and V8 compiles an object literal about 4.7x slower than it parses the equivalent JSON. That is a measured regression, not a rounding error — see [ADR-008](../../docs/DECISIONS.md).

Warm path — `tinybench`, microseconds per call:

| op | v1 | v2 | change |
|---|---|---|---|
| `getWilayas` | 0.037 | 0.030 | 1.2x |
| `getCommunes` | 0.036 | 0.032 | 1.1x |
| `getAll` | 0.033 | 0.031 | 1.1x |
| `byWilaya` | 0.131 | 0.032 | 4.1x |
| **`findByPostalCode`** | **5.847** | **0.031** | **188.6x** |
| `findCommune` | 35.951 | 34.443 | 1.0x |

What v2 actually buys, in order of size:

1. **`findByPostalCode` is O(1) instead of O(n)** — 5.847 µs → 0.031 µs, and it stays flat inside a loop instead of rescanning 1541 communes per call.
2. **The metadata split** — a wilaya `<select>` costs 2.36 kB gzip instead of 96.92 kB.
3. **It runs in a browser, Vite, a Cloudflare Worker, Deno or React Native at all.** v1 cannot: its entry calls `readFileSync` from `node:fs`, and no exports-map trick fixes that.

If your workload is one cold call per process and nothing else, v1 was faster. If it is a server, a bundle, or any loop, v2 is the one you want.

## API

Two invariants hold across the whole surface:

- **Every lookup that can miss returns `T | undefined`** — never `null`, never a throw, never `{}`. (`Commune.postalCode` and `Wilaya.parentWilaya` are the only `null`s in the library, and both mean *published as absent*.)
- **Everything returned is `readonly`.** Every member and every array is `readonly` in the types, so mutation is a compile error; the three bulk arrays are additionally `Object.freeze`d, so `getCommunes().push(x)` throws at run time. Individual records are *not* deep-frozen — that would be ~6000 `Object.freeze` calls on the import path — so mutating one from untyped JavaScript is possible and unsupported. Use `structuredClone` if you need a mutable copy.

### Root — `algeria-wilayas-communes`

| Export | Signature |
|---|---|
| `getWilayas` | `(opts?: AsOfOptions) => readonly Wilaya[]` |
| `getDairas` | `(opts?: AsOfOptions) => readonly Daira[]` |
| `getCommunes` | `(opts?: AsOfOptions) => readonly Commune[]` |
| `getWilaya` | `(code: WilayaCode, opts?: AsOfOptions) => Wilaya \| undefined` |
| `getDaira` | `(id: string) => Daira \| undefined` — takes **no** options |
| `getCommune` | `(id: string, opts?: AsOfOptions) => Commune \| undefined` |
| `byWilaya` | `<C extends WilayaCode>(code: C) => (WilayaTree & { readonly code: C; readonly name: NameOf<C> }) \| undefined` |
| `getDairasOfWilaya` | `(code: WilayaCode) => readonly Daira[]` |
| `getCommunesOfWilaya` | `(code: WilayaCode) => readonly Commune[]` |
| `findByPostalCode` | `(code: string) => readonly Commune[]` |
| `findCommunesByName` | `(name: string) => readonly Commune[]` |
| `search` | `(query: string, opts?: SearchOptions) => readonly SearchResult[]` |
| `isWilayaCode` | `(n: unknown) => n is WilayaCode` |
| `assertWilayaCode` | `(n: unknown) => asserts n is WilayaCode` |
| `isPostalCode` | `(v: unknown) => v is PostalCode` |
| `REFORM` | `Reform` — the law, the JO issue, the three dates, the 11 new wilayas |
| `resolveLegacyWilaya` | `(code: WilayaCode) => WilayaCode \| undefined` — throws while the mapping is unfilled |
| `resolveCurrentWilaya` | `(code: WilayaCode) => readonly WilayaCode[] \| undefined` — same |
| `ReformMappingUnavailableError` | `class extends Error` |
| `COMMUNES_MISSING_POSTAL_CODE` | `readonly string[]` — the 48 commune ids with no published code |
| `DATA_VERSION` / `SOURCE_LAW` / `LAST_VERIFIED` | `string` constants |
| `getAll` | `() => Algeria` — **deprecated**, v1 shape |
| `findCommune` | `(query: string) => CommuneFlat[]` — **deprecated**, v1 shape |

`getAll` and `findCommune` are the only two deprecated names at the root. `getWilayas`, `getDairas`, `getCommunes`, `byWilaya` and `findByPostalCode` survive from v1 by name but are v2's, returning v2 shapes. **The root ships no default export**, deliberately — see [Migrating from v1](#migrating-from-v1).

Types exported from the root: `Wilaya`, `Daira`, `Commune`, `WilayaTree`, `DairaSubtree`, `WilayaCode`, `PostalCode`, `NameOf`, `AsOf`, `AsOfOptions`, `SearchKind`, `SearchOptions`, `SearchResult`, `Reform`, `ReformConfidence`, `ReformNewWilaya`, plus the eight v1 type names (`Algeria`, `Country`, `CommuneFlat`, `DairaFlat`, `WilayaFlat`, and `V1Commune` / `V1Daira` / `V1Wilaya`, aliased because the unqualified names belong to v2).

### `search`

```ts
search(query: string, opts?: SearchOptions): readonly SearchResult[]

interface SearchOptions {
  lang?: "ar" | "fr" | "en";       // omit to search every layer
  limit?: number;                   // default 20; short-circuits the scan, not a top-N
  wilaya?: WilayaCode;              // candidate reduction, not a post-filter
  fuzzy?: boolean;                  // default false; runs only as a last resort
  kinds?: readonly SearchKind[];    // "wilaya" | "daira" | "commune"
}
```

Results are ranked and carry the owning wilaya, because that is what disambiguates repeated names. The score bands are published and do not overlap, so you can threshold on them: **exact `1.0`**, **prefix `0.7`–`0.9`**, **substring `0.4`–`0.6`**, **fuzzy `0.25`–`0.35`**.

### Subpaths

Seven, and no more. There is no `/lite`; it was specified and then not shipped ([ADR-009](../../docs/DECISIONS.md)).

| Subpath | Contains | Omits |
|---|---|---|
| `.` | everything above | — |
| `./wilayas` | `getWilayas`, `getWilaya`, `isWilayaCode`, `assertWilayaCode` | `asOf`; daïras, communes; all name search |
| `./dairas` | the above **+** `getDairas`, `getDaira`, `getDairasOfWilaya` | `asOf`; communes; all name search |
| `./communes` | the above **+** `getCommunes`, `getCommune`, `getCommunesOfWilaya`, `findByPostalCode`, `isPostalCode`, `COMMUNES_MISSING_POSTAL_CODE` | `asOf`; `search` and `findCommunesByName` |
| `./zod` | `wilayaCodeSchema`, `postalCodeSchema`, `communeSchema`, `dairaSchema`, `wilayaSchema`, `addressSchema` | — (zod is an optional peer) |
| `./legacy` | all seven v1 functions **and** the v1 default export object | v2 shapes |
| `./data/*` | the raw JSON files, unbundled | types, lookups, indexes |

### Why `PostalCode` is branded

```ts
type PostalCode = string & { readonly __brand: "PostalCode" };
```

The obvious alternative is `` `${number}${number}${number}${number}${number}` ``, and it does not hold up. Measured on TypeScript 5.9: that template type accepts `"1 234"` — a space is not a digit — and a plain `` `${number}` `` additionally accepts `"1e5"`, `"-1"` and `"1.5"`. Neither form can express "five digits", and neither knows whether the code exists. The brand erases to `string` at run time and is mintable only through `isPostalCode`, which runs the real `/^\d{5}$/`. Query arguments such as `findByPostalCode(code)` take a plain `string` on purpose; the brand is for values you store and pass around.

## Recipes

Six, complete and runnable. Each was executed against the built package before being pasted here.

### 1. A dependent wilaya → daïra → commune `<select>` chain (React / Next.js)

The one everybody ships broken: changing the wilaya must clear **both** children, not just the next one, or the form submits a commune from the previous wilaya.

```tsx
"use client";

import { useState } from "react";
import {
  getWilayas,
  getDairasOfWilaya,
  getCommunesOfWilaya,
  type WilayaCode,
} from "algeria-wilayas-communes/communes";

const WILAYAS = getWilayas();

export function AddressPicker() {
  const [wilaya, setWilaya] = useState<WilayaCode | null>(null);
  const [dairaId, setDairaId] = useState("");
  const [communeId, setCommuneId] = useState("");

  const dairas = wilaya === null ? [] : getDairasOfWilaya(wilaya);
  const communes =
    wilaya === null ? [] : getCommunesOfWilaya(wilaya).filter((c) => c.daira === dairaId);

  return (
    <fieldset>
      <select
        name="wilaya"
        value={wilaya ?? ""}
        onChange={(e) => {
          setWilaya(e.target.value === "" ? null : (Number(e.target.value) as WilayaCode));
          setDairaId(""); // reset BOTH children, not just the next one
          setCommuneId("");
        }}
      >
        <option value="">Wilaya…</option>
        {WILAYAS.map((w) => (
          <option key={w.code} value={w.code}>
            {w.codeText} — {w.name.fr}
          </option>
        ))}
      </select>

      <select
        name="daira"
        value={dairaId}
        disabled={dairas.length === 0}
        onChange={(e) => {
          setDairaId(e.target.value);
          setCommuneId(""); // the commune below is no longer reachable
        }}
      >
        <option value="">Daïra…</option>
        {dairas.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name.fr}
          </option>
        ))}
      </select>

      <select
        name="commune"
        value={communeId}
        disabled={communes.length === 0}
        onChange={(e) => setCommuneId(e.target.value)}
      >
        <option value="">Commune…</option>
        {communes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name.fr}
            {c.postalCode === null ? "" : ` (${c.postalCode})`}
          </option>
        ))}
      </select>
    </fieldset>
  );
}
```

### 2. Arabic names, right-to-left, and searching in Arabic

`name.ar` is present and non-empty for all 1541 communes, all 566 daïras and all 69 wilayas, so an Arabic UI needs no fallback table.

```tsx
"use client";

import { useMemo, useState } from "react";
import { search } from "algeria-wilayas-communes";

export function ArabicCommuneSearch() {
  const [query, setQuery] = useState("");

  // `kinds` filters at run time; the `.filter` is what narrows the union for TS.
  const results = useMemo(
    () =>
      query.trim() === ""
        ? []
        : search(query, { lang: "ar", kinds: ["commune"], limit: 8 }).filter(
            (r) => r.kind === "commune",
          ),
    [query],
  );

  return (
    <div dir="rtl" lang="ar">
      <label htmlFor="q">ابحث عن بلدية</label>
      <input
        id="q"
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="عين الحجر"
      />
      <ul>
        {results.map((r) => (
          <li key={r.item.id} data-score={r.score}>
            {/* the wilaya is what disambiguates: names repeat across wilayas */}
            <bdi>{r.item.name.ar}</bdi> — <bdi>{r.wilaya.name.ar}</bdi>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Typing `عين الحجر` returns three communes, in Bouira, Setif and Saida. Rendering the wilaya beside the name is not decoration — without it the list is ambiguous.

### 3. Validating a checkout address with zod

`zod` is an **optional peer dependency**: the `/zod` subpath is only usable if you install zod yourself (`^3.23` or `^4`). `addressSchema` validates against the dataset, not just against a shape.

```ts
import { addressSchema } from "algeria-wilayas-communes/zod";

const submitted = {
  wilaya: 19,
  daira: "19-ain-azel",
  commune: "19-ain-azel-ain-lahdjar",
  postalCode: "19018",
  line1: "12 Rue des Freres Bouchama",
};

const ok = addressSchema.safeParse(submitted);
console.log(ok.success); // → true

// Same commune, claimed under Alger. The shape is valid; the address is not.
const bad = addressSchema.safeParse({ ...submitted, wilaya: 16 });
console.log(bad.success); // → false
console.log(bad.error?.issues.map((i) => [i.path.join("."), i.message]));
// → [ [ "commune", "Commune 19-ain-azel-ain-lahdjar does not belong to wilaya 16" ] ]

// A wrong postal code attaches to the postalCode field, so react-hook-form
// and friends put the message under the right input.
const wrongCode = addressSchema.safeParse({ ...submitted, postalCode: "19007" });
console.log(wrongCode.error?.issues[0]?.path); // → [ "postalCode" ]
```

The 48 communes with no postal code are exempt from the postal-code check: our data gap must not become the user's form error.

### 4. Seeding a database (Drizzle; the same shape works for Prisma)

Slug ids (`"19-ain-azel-ain-lahdjar"`) are **library-assigned, not official** — only wilayas have a government identifier, the code `01`..`69`. They are stable across patch and minor releases; if you need a government-issued key, there is not one below the wilaya level.

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { getWilayas, getDairas, getCommunes } from "algeria-wilayas-communes/communes";

export const wilayas = sqliteTable("wilayas", {
  code: integer("code").primaryKey(), // 1..69 — the only official identifier
  codeText: text("code_text").notNull(), // "01".."69"
  nameAr: text("name_ar").notNull(),
  nameFr: text("name_fr").notNull(),
});

export const dairas = sqliteTable("dairas", {
  id: text("id").primaryKey(), // "19-ain-azel" — library-assigned, not official
  wilaya: integer("wilaya").notNull().references(() => wilayas.code),
  nameAr: text("name_ar").notNull(),
  nameFr: text("name_fr").notNull(),
});

export const communes = sqliteTable("communes", {
  id: text("id").primaryKey(), // "19-ain-azel-ain-lahdjar" — library-assigned
  wilaya: integer("wilaya").notNull().references(() => wilayas.code),
  daira: text("daira").notNull().references(() => dairas.id),
  nameAr: text("name_ar").notNull(),
  nameFr: text("name_fr").notNull(),
  postalCode: text("postal_code"), // nullable: 48 communes have none
});

const sqlite = new Database("algeria.db");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

// Your migrations own the DDL; inlined here so this file runs on its own.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS wilayas (code INTEGER PRIMARY KEY, code_text TEXT NOT NULL, name_ar TEXT NOT NULL, name_fr TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS dairas (id TEXT PRIMARY KEY, wilaya INTEGER NOT NULL REFERENCES wilayas(code), name_ar TEXT NOT NULL, name_fr TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS communes (id TEXT PRIMARY KEY, wilaya INTEGER NOT NULL REFERENCES wilayas(code), daira TEXT NOT NULL REFERENCES dairas(id), name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, postal_code TEXT);
`);

const chunk = <T>(rows: readonly T[], n = 200) =>
  Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, i * n + n));

sqlite.transaction(() => {
  db.insert(wilayas)
    .values(
      getWilayas().map((w) => ({
        code: w.code,
        codeText: w.codeText,
        nameAr: w.name.ar,
        nameFr: w.name.fr,
      })),
    )
    .run();

  for (const rows of chunk(getDairas())) {
    db.insert(dairas)
      .values(rows.map((d) => ({ id: d.id, wilaya: d.wilaya, nameAr: d.name.ar, nameFr: d.name.fr })))
      .run();
  }

  for (const rows of chunk(getCommunes())) {
    db.insert(communes)
      .values(
        rows.map((c) => ({
          id: c.id,
          wilaya: c.wilaya,
          daira: c.daira,
          nameAr: c.name.ar,
          nameFr: c.name.fr,
          postalCode: c.postalCode, // null stays null — never invent a code
        })),
      )
      .run();
  }
})();

const count = (t: string) => sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number };
console.log(count("wilayas").n, count("dairas").n, count("communes").n); // → 69 566 1541
```

Insert parents first: the commune rows carry foreign keys to both `wilayas.code` and `dairas.id`.

### 5. An address endpoint that rejects an impossible pairing (Hono)

A commune id and a wilaya code can each be valid and still contradict each other. That is a 422, not a 400 and not a 404.

```ts
import { Hono } from "hono";
import { getCommunesOfWilaya, isWilayaCode } from "algeria-wilayas-communes/communes";

const app = new Hono();

app.post("/addresses", async (c) => {
  const body = (await c.req.json()) as { wilaya?: unknown; commune?: unknown };

  if (!isWilayaCode(body.wilaya)) {
    return c.json({ errors: [{ field: "wilaya", message: "Not a wilaya code (1..69)" }] }, 422);
  }

  // Membership, not existence: the commune must be in the CLAIMED wilaya.
  const commune = getCommunesOfWilaya(body.wilaya).find((x) => x.id === body.commune);
  if (commune === undefined) {
    return c.json(
      {
        errors: [
          { field: "commune", message: `Not a commune of wilaya ${String(body.wilaya)}` },
        ],
      },
      422,
    );
  }

  return c.json({ commune: commune.id, postalCode: commune.postalCode }, 201);
});

export default app;
```

Match on `id`, never on name: `Sidi Ameur` is a commune in wilaya 32 **and** in wilaya 64, and `Souk El Had` is one in 35 **and** in 48. A name is not a key.

### 6. Shipping cost by wilaya (Yalidine / ZR Express / Noest style zones)

Keying the price table by `WilayaCode` turns a typo into a compile error instead of a 0 DA quote.

```ts
import { getWilayas, assertWilayaCode, type WilayaCode } from "algeria-wilayas-communes/wilayas";

type Zone = "centre" | "est" | "ouest" | "sud" | "grand-sud";

const PRICE: Record<Zone, { desk: number; home: number }> = {
  centre: { desk: 400, home: 600 },
  est: { desk: 500, home: 750 },
  ouest: { desk: 500, home: 750 },
  sud: { desk: 700, home: 1100 },
  "grand-sud": { desk: 900, home: 1400 },
};

// Keys are typed WilayaCode, so a typo is a compile error, not a 0 DA quote.
const ZONE: Partial<Record<WilayaCode, Zone>> = {
  13: "ouest", 22: "ouest", 31: "ouest", 46: "ouest",
  19: "est", 23: "est", 25: "est", 63: "est", 65: "est",
  3: "sud", 17: "sud", 30: "sud", 39: "sud", 47: "sud", 68: "sud", 69: "sud",
  1: "grand-sud", 8: "grand-sud", 11: "grand-sud", 33: "grand-sud", 37: "grand-sud",
  // 70: "est",  // ✗ Object literal may only specify known properties — 70 is not a WilayaCode
};

export function quote(wilayaCode: number, delivery: "desk" | "home"): number {
  assertWilayaCode(wilayaCode); // throws on 0, 70, "19", 19.5
  return PRICE[ZONE[wilayaCode] ?? "centre"][delivery];
}

// All 69 wilayas price; nothing falls through to undefined.
const rows = getWilayas().map((w) => `${w.codeText} ${w.name.fr}: ${quote(w.code, "home")} DA`);
console.log(rows.length, rows[18], rows[0]); // → 69 "19 Setif: 750 DA" "01 Adrar: 1400 DA"
```

The zone assignment above is an example, not carrier data — replace it with your carrier's grid. What the package guarantees is that all 69 codes exist and that an invalid one cannot reach the table.

## Provenance, gaps and the reform

### Where the data comes from

The dataset's own `sources` array, verbatim:

```json
["ONS Code Geographique National / Loi 19-12 (2019) / Loi 26-06 (2026)", "othmanus/algeria-cities"]
```

Three provenance constants are **exported**, not merely documented, so compliance and procurement questions have a one-line answer you can log — or assert on in your own test suite:

```js
import { DATA_VERSION, SOURCE_LAW, LAST_VERIFIED, REFORM } from "algeria-wilayas-communes";
import assert from "node:assert/strict";

assert.equal(DATA_VERSION, "2.0.0");
assert.equal(SOURCE_LAW, "Loi 26-06 du 4 avril 2026, JO n°25");
assert.equal(LAST_VERIFIED, "2026-07-20");
assert.equal(REFORM.mappingComplete, false); // see "The stub, and its limit" below
```

Details: [DATA_PROVENANCE.md](../../docs/DATA_PROVENANCE.md) · [DATA_POLICY.md](../../docs/DATA_POLICY.md) · [SUPPORT.md](../../SUPPORT.md)

### The postal-code shape: 1493 / 1476 / 38

- **1493** of the 1541 communes carry a postal code; **27** do not.
- Those 1493 codes are only **1476 distinct** values.
- **38** codes are used by more than one commune.

Those are three different numbers and conflating them writes a bug. `findByPostalCode` therefore returns `readonly Commune[]`, not `Commune | undefined`: `findByPostalCode("19046")` legitimately returns three communes, in Setif, Khenchela and Relizane. A postal code is not a key; the commune `id` is. Any lookup that assumes one code means one commune is wrong on 17 codes.

### The 48 communes with no postal code

No source available to this project publishes them. They ship as `postalCode: null` — `null` means *published as absent*, where `undefined` would mean *we did not look* — and their ids are exported as `COMMUNES_MISSING_POSTAL_CODE`. **A guessed postal code will never be added**, not from a neighbouring commune and not from the wilaya prefix.

27 of the 48 are never published: no source available to this project has them. The other **21 were withdrawn** — they shipped carrying a code that belongs elsewhere (Saïda's `Ain El Hadjar` held Bouira's `10031`; Annaba's `El Eulma` held Sétif's `19001`; Alger's `Hammamet` held Tébessa's `12016`, and its replacement is disputed). Both withdrawals are cited in `data/raw/postal-corrections.json` and the build fails if the ledger and the data disagree. For a consumer the two causes behave identically: the code is absent, and must not be invented.


| Wilaya | Commune | Daïra |
|---|---|---|
| 04 Oum El Bouaghi | Ouled Zouai | Souk Naamane |
| 05 Batna | Lemcene | Ouled Si Slimane |
| 05 Batna | Talkhamt | Ras El Aioun |
| 10 Bouira | Ouled Rached | Bechloul |
| 13 Tlemcen | Beni Boussaid | Beni Boussaid |
| 15 Tizi Ouzou | Abi-Youcef | Ain El Hammam |
| 15 Tizi Ouzou | Ait-Oumalou | Tizi Rached |
| 16 Alger | Hammamet | Cheraga |
| 19 Setif | Guelta Zerka | El Eulma |
| 20 Saida | Ain El Hadjar | Ain El Hadjar |
| 20 Saida | Maamora | El Hassasna |
| 21 Skikda | El Marsa | Ben Azzouz |
| 21 Skikda | Ouldja Boulbalout | Ain Kechra |
| 23 Annaba | El Eulma | Ain El Berda |
| 23 Annaba | Treat | Berrahal |
| 24 Guelma | Beni Mezline | Guelaat Bousbaa |
| 24 Guelma | Bou Hamdane | Hammam Debagh |
| 24 Guelma | Khezaras | Khezaras |
| 26 Medea | Mezerana | Tablat |
| 26 Medea | Sidi Ziane | Souaghi |
| 27 Mostaganem | Mansourah | Mesra |
| 27 Mostaganem | Safsaf | Bouguirat |
| 28 M'Sila | El Houamed | Khoubana |
| 29 Mascara | Ain Fares | Ain Fares |
| 29 Mascara | Mohammadia | Mohammadia |
| 29 Mascara | Tizi | Tizi |
| 30 Ouargla | Ain Beida | Sidi Khouiled |
| 31 Oran | Ain Turk | Ain Turk |
| 32 El Bayadh | Sidi Ameur | Sidi Ameur |
| 34 Bordj Bou Arreridj | Elhammadia | El Hamadia |
| 34 Bordj Bou Arreridj | Ouled Sidi-Brahim | Mansourah |
| 35 Boumerdes | El Kharrouba | Boudouaou |
| 35 Boumerdes | Souk El Had | Thenia |
| 35 Boumerdes | Timezrit | Isser |
| 36 El Tarf | Zitouna | El Tarf |
| 38 Tissemsilt | Larbaa | Lazharia |
| 38 Tissemsilt | Sidi Slimane | Bordj Bounaama |
| 39 El Oued | El Ogla | Robbah |
| 41 Souk Ahras | Sidi Fredj | Merahna |
| 44 Ain Defla | Ain-Soltane | Ain Lechiakh |
| 46 Ain Temouchent | Chentouf | Hammam Bou Hadjar |
| 46 Ain Temouchent | Emir Abdelkader | Beni Saf |
| 47 Ghardaia | Mansoura | Mansourah |
| 48 Relizane | El Hassi | Ammi Moussa |
| 48 Relizane | El Ouldja | Ammi Moussa |
| 48 Relizane | Souk El Had | Thenia |
| 64 Bou Saada | Sidi Ameur | Sidi Ameur |
| 66 Ksar El Boukhari | Bouaiche | Chahbounia |

If you have a sourced code for any of these — an official document, not an inference — please open an issue.

### The 2026 reform

**Loi 26-06** was signed on **4 April 2026** and published in **Journal Officiel n°25 on 5 April 2026**. It creates 11 new wilayas, raising the count from 58 to 69. Powers transfer progressively from the *wilayas mères* until **31 December 2026**, and the 11 are fully operational on **1 January 2027**.

| | | | |
|---|---|---|---|
| 59 Aflou | 60 El Abiodh Sidi Cheikh | 61 El Aricha | 62 El Kantara |
| 63 Barika | 64 Bou Saada | 65 Bir El Ater | 66 Ksar El Boukhari |
| 67 Ksar Chellala | 68 Ain Oussara | 69 Messaad | |

Through 2026 **both** the 58- and the 69-wilaya maps are legally real — an address is not wrong under either — and that is the problem this package exists to solve. The default is the 69-wilaya map; `REFORM` carries the law reference and the three dates and never throws.

### The stub, and its limit

**The 58 → 69 parent mapping is not in the dataset, and is not guessed.** Which *wilaya mère* each new wilaya was carved out of has to be transcribed from Loi 26-06 / JO n°25 by a maintainer, and until that happens it ships as a stub: all 11 `parentCode` values are `null`, `confidence` is `"unverified"`, and `REFORM.mappingComplete` is `false`.

While it is false, `resolveLegacyWilaya`, `resolveCurrentWilaya`, and any accessor called with `{ asOf: "58" }` **throw `ReformMappingUnavailableError`**. That is deliberate: a wrong parent produces a wrong shipping label or a wrong tax jurisdiction, silently. Branch on `REFORM.mappingComplete` rather than catching:

```js
const legacy = REFORM.mappingComplete ? resolveLegacyWilaya(68) : undefined;
```

Everything else is unaffected — the default path, `{ asOf: "69" }`, and reading `wilaya.parentWilaya` (a plain field read that returns `null`) never throw. No postal-prefix inference, no "probably", no partial table.

## Migrating from v1

**Nothing written against v1 breaks.** All seven v1 functions and the v1 default-export object live permanently at `algeria-wilayas-communes/legacy`, returning the exact v1 snake_case shapes. A one-line import change is the whole migration:

```js
import dz from "algeria-wilayas-communes/legacy";
dz.getWilayas()[0].nom_fr; // v1 shape, v1 semantics, v1 mutability
```

`/legacy` is not a deprecation shim on a timer — it is supported for the life of the v2 line.

### Field mapping

| v1 | v2 |
|---|---|
| `nom_fr` | `name.fr` |
| `nom_ar` | `name.ar` |
| `nom_en` | `name.en` |
| `code_postal` | `postalCode` (`string \| null`) |
| `wilaya_num` | `wilaya.code` (number) / `wilaya.name.fr` |
| `daira_fr` | `daira.name.fr` |
| `nb_communes` | `communeCount` |
| `nb_dairas` | `dairaCount` |

On a flat v2 `Commune`, `wilaya` is the numeric code and `daira` is the daïra id — join with `getWilaya()` / `getDaira()`, or use `byWilaya()` for the nested tree. `SearchResult` already carries the resolved `wilaya` record.

### Breaking changes

**1. The root has no default export.** `import dz from "algeria-wilayas-communes"` now fails at ESM link time:

```
SyntaxError: The requested module 'algeria-wilayas-communes' does not provide an export named 'default'
```

That error is raised before any of your code runs. The alternative would have been silence — v2 objects whose `.nom_fr` reads `undefined`, discovered in production. The fix is one line: import from `algeria-wilayas-communes/legacy`. Anyone pinned to `^1.0.0` is untouched; this is a major version.

**2. `engines.node` moved from `>=16` to `>=18`.** Node 16 reached end of life in September 2023. npm prints `EBADENGINE` and installs anyway unless you have set `engine-strict=true`. There is no shim; a Node 16 user pins `algeria-wilayas-communes@1`.

**3. v2 data is readonly and frozen; v1 handed back live mutable objects.** v1 returned the cached `JSON.parse`, so `getCommunes()[0].nom_fr = "X"` mutated the dataset for the rest of the process. In v2 every member is `readonly` — a compile error in TypeScript — and the three bulk arrays are frozen, so `getCommunes().push(x)` and `getCommunes()[0] = x` throw in strict mode. Shared mutable global state in a data package is a defect. **The mitigation covers almost all of it:** `/legacy` and the deprecated root shims return unfrozen, mutable, cached projections, so v1 mutation code keeps working verbatim — and because those projections are separate objects, mutating one cannot corrupt the v2 data. If you want a mutable v2 record, `structuredClone(getCommune(id))`.

**4. `wilaya.code` changed type — this is the one that bites.** `code` survives the rename verbatim, so it reads as unchanged. It is not: v1's `code` was the zero-padded *string*, v2's is the *number*. The padded form moved to `codeText`.

```js
// v1
const w = byWilaya(6);   // algeria-wilayas-communes/legacy
w.code;                  // "06"    — string
`${w.code}000`;          // "06000" — a real Bejaia postal prefix

// v2
const w = getWilaya(6);
w.code;                  // 6       — number
w.codeText;              // "06"    — use this for prefixes, plates, URLs, filenames
`${w.code}000`;          // "6000"  — the silent break
```

Nothing throws; the string is simply one character short. Audit every template literal, licence-plate string, URL segment and filename built from `code`.

### Fixed in v2: `require()` actually works

v1's README documented `const dz = require("algeria-wilayas-communes")` — and that line **threw**. v1 is `"type": "module"` with only an `"import"` condition in its exports map, so no CommonJS consumer could ever have existed. v2 ships a dual ESM/CJS build, which makes the documented example true for the first time. Not a new feature: a five-year-old README promise finally kept.

## Comparison

### Compared with the alternatives

Every cell below was counted from the **published artifact**, not from a README claim: each package
was fetched from npm, unpacked, and its shipped data files counted on 31 August 2026. Where a value
could not be established it reads `—`. Versions are the latest published at that date.

| package | wilayas | daïras | communes | Arabic names | postal codes | types | runtime deps | browser / edge | provenance published | licence |
|---|---|---|---|---|---|---|---|---|---|---|
| **algeria-wilayas-communes** (this) | **69** | 566 † | 1541 | ar + fr + en, all levels | 1493 of 1541, 48 documented `null` | yes | none | yes | yes — three exported constants + `sources` | CC0-1.0 |
| `geoalgeria` 2.0.0 | 69 | 556, `name_fr` only | 1541 | wilayas + communes; none on daïras | 1405 of 1541 | yes | none | no — `index.js` calls `fs.readFileSync` | yes — `dataset-metadata.json`, `dateModified` 2026-08-21 | MIT |
| `algeria-locations` 1.0.6 | 58 | 548 | 1468 | yes, all levels | 1468 of 1468 | no | none | yes | no | ISC |
| `algeria-wilayas` 1.0.1 | 58 | 548 | 1541 | yes, all levels | none | yes | none | yes | no | MIT |
| `dz-wilayas` 1.0.2 | 58 | 548 | 1541 | wilayas + communes | none | yes | none | yes | no | MIT |
| `algerian-geo` 1.0.10 | 58 | none | 1541 | 1539 of 1541 communes | 1541 of 1541 | no | none | yes | no | MIT |
| `dz-communes` 1.0.1 | 48 | none | 1541 | none | 1541 of 1541 | no | none | yes | no | MIT |
| `othmanus/algeria-cities` (GitHub) | 58 | 548, denormalized | 1541 | yes | separate file, keyed by commune | n/a | n/a | n/a | prose claim, no date | none declared |

**† The daïra count is not comparable across rows, and 566 is not a claim about the official
total.** Daïra→commune membership in this dataset comes from the pre-2025 structure, regrouped under
the 69 new wilayas, so a daïra that the reform split across two wilayas appears under each one it
touches. That is what `note_daira` in `data/algeria.json` records, and it is why the figure is 566
over only 545 distinct names. `geoalgeria` states the post-reform official count as 564 and ships
556. Read the column as "does this dataset model daïras at all", not as a scoreboard.

Two rows worth reading twice. `geoalgeria` is the only other package here carrying the 69-wilaya
map, and it publishes a dated provenance file — if you do not need a browser build it is a real
alternative. And `othmanus/algeria-cities` is upstream of this dataset: it is named in this project's
own `sources` array, and three of the npm packages above ship its records verbatim without saying so.

Not listed, and why: `algeriacitiesdata` (requires PostgreSQL, depends on `pg` and `prompt-sync`),
`states-alg` (its `daira` field holds commune-count records, not daïras), `dz-wilaya` and
`algeria-zones` (both fail to import as published — a `SyntaxError` and an
`ERR_MODULE_NOT_FOUND` respectively), `algeria` 0.0.3 (48 wilayas, no Arabic, last published years
ago), and the map/UI components `algeria-map-ts`, `react-algeria-map` and `dz-tc-react`, which render
divisions rather than publish them. **PyPI has no competing Algerian administrative-divisions
package at all** — every plausible name 404s.

One caveat about `algeria-locations`: its README announces "Now fully updated to support the new 69
Wilayas", and its shipped `dist/index.js` contains 58. That is stated here because the table counts
artifacts rather than claims, and it is the reason it counts artifacts.

## One product, two languages

The [PyPI package of the same name](https://pypi.org/project/algeria-wilayas-communes/) ships the **same data under the same name**, published from the **same `v*` git tag** — so a version number means the same 1541 records on both registries.

They are not merely similar: they return the same record ids, the same search scores and the same answers, enforced by shared conformance fixtures that both test suites run against, plus a test that diffs all 2107 ids across the two implementations. The rules both sides implement are written down once, in [`shared/contract/`](../../shared/contract/). Pick whichever language you are already in.

## Source and issues

**https://github.com/el-amin-dev/algeria-wilayas-communes**

## Licence

**CC0-1.0 — public domain, no attribution required.** For a company that means there is nothing for legal to review, nothing to attribute in your UI, and no third-party notice to ship with your build. Vendor the JSON, fork it, resell it; no one has to be asked.
