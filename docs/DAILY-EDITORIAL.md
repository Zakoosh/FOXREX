# FOXREX daily website publication

## Owner mandate (25 October 2026)

The owner explicitly requested automatic daily website publication of gold/forex articles, a daily brief, and an economic calendar. This authorizes this editorial pipeline to publish verified website content without per-item human confirmation. It supersedes the earlier manual-only requirement **for this pipeline only**. Studio's manual review/approval gates, paid-media generation policy, social publishing and trading/execution settings are unchanged.

The ChatGPT task **نشر FOXREX اليومي** runs each morning around 08:00 Europe/Istanbul, starting 26 October 2026 (flexible window; not a minute-exact SLA). Research and writing run in that task using web search and the connected GitHub app. No paid API key, always-on laptop, local Ollama instance or GitHub cron is required. Scheduling is managed in ChatGPT, not by a file in this repository. A task is an execution attempt, not a guarantee of publication; every run must report evidence or a failure.

## Required package

1. Current-day brief, gold and major FX, in Arabic, English and Turkish. On weekends explicitly label it a weekend/outlook brief; do not manufacture a closing price or call it live.
2. At least one original sourced trilingual article on gold, FX, macro or trading education. Check existing titles/URLs and vary the topic. All published items need permanent pages and must be discoverable.
3. Today's verified events and a rolling next-seven-day calendar. Official release dates and agency timezones take precedence. Coverage may be selective but must say so. Each event includes date/time (UTC stored, Europe/Istanbul displayed), country/currency, bilingual title, source and check time. Impact is an editorial judgment. Previous, consensus and actual must be null unless each has a source URL. Never publish an actual before release. A blank calendar filter means no listed verified events, not no global events.

Use fresh primary research for important statements. Distinguish facts, sourced consensus and conditional interpretation. No invented prices, support/resistance, returns, probabilities or release times. Do not import the older Claude draft PRs without fresh verification. Do not copy source articles. Preserve brand/design and EN/AR pairing. No paid APIs, social posts or trade execution.

## Publication procedure

Read the current default branch and check concurrent changes before each publication. GitHub Pages currently deploys `main` / root with the custom domain `foxrex.co`. The owner-authorized publisher is an additional input to the same canonical v3 feed; it does not create a second article store.

Create `content-ops/daily/YYYY-MM-DD/package.json` with:

```json
{
  "authorization": "owner-authorized-2026-10-25",
  "date": "YYYY-MM-DD",
  "records": ["EN and AR CMS input records: see the first package"],
  "calendar": {"schemaVersion": 1, "updatedAt": "UTC timestamp", "timezone": "Europe/Istanbul", "coverage": {"en": "scope", "ar": "النطاق"}, "events": []}
}
```

Each record uses `type`, `language`, `slug`, `title`, `summary`, `body`, `sourceReferences` and type-specific `fields`. Sources require current-day `retrievedAt`. The pipeline generates IDs/groups and publication timestamps, validates CMS records and the entire canonical feed, and records `origin: scheduled-editorial` and AI assistance honestly. It never claims a human approved an AI-written item. Studio records cannot be overwritten by this pipeline. Signal and trading-idea publication are excluded. Each item requires EN+AR+TR.

```sh
node tools/editorial/publish.mjs content-ops/daily/YYYY-MM-DD/package.json
node tools/editorial/publish.mjs content-ops/daily/YYYY-MM-DD/package.json --apply
node tools/site/build.mjs
node tools/site/check-feed.mjs
node tools/site/build.mjs --check
cd worker
npm test
npm run check
```

Commit validated feed, calendar, generated pages, sitemap, manifest and daily provenance in **one atomic Git commit**, based on the current deployment head. Never force-push or replace concurrent work. Read the head again before updating its ref; if changed, rebuild from the new head. If git push is unavailable, GitHub `create_tree` + `create_commit` + non-forced `update_ref` can publish the same validated files. Do not mutate the public feed by hand or skip checks.

Daily IDs use the editorial date and slug; identical retries do not add entries or increment versions. Within-day edits preserve first publication and URL. New evergreen articles must have new slugs; do not collide with existing permanent URLs. Preserve older content and Studio withdrawals. Market-sensitive copy needs `dataAsOf` and a reasonable `validUntil`. Article pages show source links, dates, covers and contextual CTAs without public editor/AI labels; archives remain addressable.

After the commit, inspect Pages build status, fetch the served public feed/calendar and open the exact article URLs. Report `COMMITTED`, `DEPLOYED`, and `LIVE_VERIFIED` separately. Never claim live success just because a commit exists. If research is insufficient, omit unsupported details and publish the verified subset with a clear coverage/data note. If deployment fails, report the real error.

## Calendar behavior

`data/calendar.json` is validated before site generation by `tools/editorial/calendar.mjs`. `/calendar/` and `/ar/calendar/` contain static, crawlable rows; a small script filters today/next seven days/currency, updates across date boundaries, and shows a stale warning after 36 hours. Static rows are available without JavaScript. This is a daily editorial calendar, not a real-time actual-results feed.

## Presentation requirements (owner update, 26 October 2026)

Use the professional article template with topic-relevant owned covers, short paragraphs, useful first-line subheadings, a table of contents and calendar/Telegram CTAs. Keep source links, dates and internal provenance; do not display an editor or AI byline. Every new item must have Arabic, English and Turkish records and meaningful alt text. Preserve the semantic dark/light themes. Translate new Turkish labels in data/locales/tr.json and use localized dates. See EDITORIAL-EXPERIENCE.md.
