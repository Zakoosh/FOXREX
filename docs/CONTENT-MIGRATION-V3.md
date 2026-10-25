# FOXREX Content Migration v2 → v3

Tool: `tools/content/migrate-v2-v3.mjs`. Pure logic: `migrateFeedV2` and `migrateEntryV2` in `studio/cms-model.js`.

## 1. Guarantees

| Requirement | How |
|---|---|
| **No data loss** | Every v2 key is kept verbatim. A renamed type keeps its original name in `legacyType`. The report compares every field of every item and fails on any loss. |
| **Repeatable** | A v3 input is detected (`alreadyV3`) and left byte-identical. |
| **Deterministic** | Same input, byte-identical output: stable sort, no clock and no randomness. |
| **Dry run** | This is the default. It prints the summary and writes nothing without `--write`. |
| **Clear report** | Items by type, renamed types, collisions, the lossless flag and losses. `--report <file>` writes JSON. |
| **Rollback-safe** | `--write` first copies the untouched input to `<file>.v2-backup.json` (git-ignored) and writes atomically (temporary file, then rename). |
| **Publishes nothing** | The tool reads and writes one file. It has no git, network or publishing step (enforced by a test). |
| **Validated** | Input against `data/content.schema.v2.json`; output against the v3 schema plus `feedIntegrity`. Output is written only when both pass. |

## 2. Mapping

| v2 | v3 |
|---|---|
| `US_OPEN` | `US_SESSION_PREVIEW` (`legacyType: US_OPEN`) |
| `LEARN` | `REX_EXPLAINS`, format `lesson` |
| `REX_NOTE` | `REX_EXPLAINS`, format `note` |
| `ASK_REX` | `REX_EXPLAINS`, format `qa` |
| `REX_EXPLAINS` | `REX_EXPLAINS`, format `explainer` |
| other types | unchanged |

**Added on every entry:**
- **Placement:** `layer` (and `layers` for Gold Focus), `editorialDate` (Istanbul date of `publishedAt`) and `urlPath`
  (by the route rules).
- **Rights and provenance:** `access: PUBLIC`, `origin: migration-v2` and `attribution: { byline: 'FOXREX Desk',
  assistance: 'unknown' }`. The migration does not claim how old content was produced.
- **Derived fields:** `instruments`, `timeframes` and `priceRef`, when a sourced price exists.
- **Freshness** (price-sensitive types only): `dataAsOf` (price time or publication time, basis `migration`) and the
  default `validUntil` and `stalePolicy`.

**The feed gains** `withdrawn: []`, and its `publication` becomes `{ id: 'migration-v2-v3', action: 'migrate' }`
when it has items.

## 3. Collisions

If two v2 items would receive the same permanent path in one language, or a path cannot be derived, the migration
**fails** with a report naming the items. It never renames silently. Fix the slug in Studio, re-publish or edit the v2
feed, then run the migration again.

## 4. Production run (2026-10-04)

`data/content.json` was schema v2 with **0 items**.
- **Dry run:** "schema v2 → v3: 0 item(s), lossless=true, renamed types=0, collisions=0".
- **`--write` result:** schema v3 with `items: []` and `withdrawn: []`. 0 items before and 0 after; no content was
  added, changed or removed.
- **Re-run:** "Already schema v3: 0 item(s) … no change needed".

**Engine safety:** `normalizeFeed` upgrades an **empty** v2 feed in place, but refuses a v2 feed that contains items.
The publisher therefore can never migrate content implicitly.

## 5. Usage

```sh
node tools/content/migrate-v2-v3.mjs                                # dry run on data/content.json
node tools/content/migrate-v2-v3.mjs --in old.json --report r.json  # dry run + JSON report
node tools/content/migrate-v2-v3.mjs --write                        # migrate in place (backup first)
node tools/site/build.mjs                                           # then generate the permanent pages
node tools/site/check-feed.mjs && node tools/site/build.mjs --check
```

To roll back, restore `data/content.v2-backup.json` (or run `git checkout -- data/content.json`), then run
`node tools/site/build.mjs`. The manifest removes the generated pages.
