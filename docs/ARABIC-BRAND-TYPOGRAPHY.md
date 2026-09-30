# FOXREX Arabic Brand Typography

**Status:** canonical. This is the single Arabic typography system for FOXREX: the website (`foxrex.co/ar/`), Instagram posts, carousels, Stories, Reels covers, Telegram cards, reports/PDFs and anything generated in FOXREX Studio. Do not create a separate social-media font identity.

Source of truth in code: `styles/tokens.css` (`--ar-*`, `--en-*`), `styles/fonts.css` (font files), `styles/ar.css` (web application). Studio loads the same `tokens.css` and `fonts.css`.

---

## 1. Typefaces

| Role | Typeface | Weights in use | Files |
|---|---|---|---|
| Arabic script | **IBM Plex Sans Arabic** | 400 Regular · 500 Medium · 600 SemiBold · 700 Bold | `assets/fonts/ibm-plex-sans-arabic-arabic-{400,500,600,700}-normal.woff2` |
| Latin, digits, market data, brand names | **Inter** | 400 · 500 · 600 · 700 · 800 · 800 Italic (wordmark only) | `assets/fonts/inter-latin-*.woff2` |

Both are SIL Open Font License 1.1 (`assets/fonts/LICENSE-*.txt`) and are **self-hosted** — no third-party font service. The Arabic files carry an Arabic-only `unicode-range`, Inter a Latin-only range, so each script automatically gets its own face inside mixed text.

Never substitute: no Cairo, Tajawal, Noto Kufi, Arial or system Arabic. If IBM Plex Sans Arabic is unavailable in a tool (e.g. a design app), install the OFL files from `assets/fonts/` rather than falling back.

## 2. Arabic type scale

Arabic has a smaller x-height and taller ascenders/descenders than Latin, so every Arabic level is **larger and looser** than its English counterpart. Values are `weight size/line-height`.

| Token | Web (fluid) | Weight | Line height | Use |
|---|---|---|---|---|
| `--ar-display` | 44 → 88 px | 700 | 1.28 | Campaign covers, one-line statements |
| `--ar-hero` | 40 → 76 px | 700 | 1.30 | Homepage hero «تداول أذكى... / فرص أكبر» |
| `--ar-h1` | 32 → 54 px | 700 | 1.38 | Page titles |
| `--ar-h2` | 26 → 40 px | 700 | 1.50 | Section titles |
| `--ar-section` | 15 px | 600 | 1.60 | Section labels / kickers («اليوم في FOXREX») |
| `--ar-card-title` | 19 px | 600 | 1.60 | Card and list titles |
| `--ar-body` | 17 px | 400 | 1.95 | Running text, articles |
| `--ar-lead` | 18 → 20 px | 400 | 1.90 | Intro paragraphs under headings |
| `--ar-caption` | 14 px | 400 | 1.80 | Meta, secondary text, disclaimers |
| `--ar-label` | 13 px | 500 | 1.60 | Badges, tabs, status labels |
| `--ar-cta` | 16 px | 600 | 1.40 | Buttons, links |
| `--ar-data` | 0.94em of context | Inter 600 | — | Symbols, prices, %, times inside Arabic |

English reference scale (`--en-*`): display 800 40→76/1.02 · h1 800 34→56/1.08 · h2 700 26→36/1.2 · card 600 18/1.35 · body 400 16/1.65.

## 3. Rules

1. **No letter-spacing on Arabic.** `letter-spacing: 0` always. Tracking breaks Arabic joining. Latin labels may keep their tracking (e.g. `TRADE SMARTER. GO FURTHER.` at 0.2em).
2. **No uppercase, no italic, no condensed Arabic.** Emphasis = weight (500→700) or colour (`#00D4A7`), never slant.
3. **Weights:** headlines 700; section labels, card titles and CTAs 600; labels 500; body 400. Do not use 800/900 on Arabic.
4. **Line breaks are editorial.** Break two-part headlines at the ellipsis, as specified:
   - تداول أذكى... ⏎ فرص أكبر
   - تحليل يساعدك على التحرك... ⏎ أو الانتظار.
   - ما الذي تحرك... ⏎ ولماذا يهم؟
   - أفكار تداول منظمة... ⏎ بمخاطر واضحة.
   - منظومة ذكاء للأسواق... ⏎ مبنية على نظام واحد.
   Avoid a single orphan word on the last line (`text-wrap: balance` on the web; manual breaks on social).
5. **Alignment:** Arabic is right-aligned (start-aligned in RTL). Centre only for short statements (≤ 2 lines) on covers.
6. **Digits:** use Western digits 0–9 set in Inter (market convention and readability of prices). Do not use Eastern Arabic-Indic digits (٠١٢…) in market data.

## 4. Latin tokens inside Arabic (bidi)

Market symbols, prices, percentages, times, data names and brand names stay **Inter, left-to-right, isolated**:

`XAUUSD · EURUSD · BTCUSD · DXY · CPI · NFP · 15:30 · +0.42% · 4,328.50 · FOXREX · REX · Telegram`

- Web: every run is wrapped in `<bdi class="lt" dir="ltr">` by `tools/site/text.mjs` (build time) and `scripts/public/content.js` (runtime). Never hand-type Unicode bidi control characters.
- Sentence punctuation (`. ، ؟ :`) stays **outside** the isolate so it lands at the Arabic end of the sentence.
- A symbol and its value form one unit: «الذهب XAUUSD +0.42%» renders `XAUUSD +0.42%` as one LTR group to the left of «الذهب».
- Size Latin at ~0.94 of the Arabic size in body, ~0.86 in headlines, so both scripts share an optical x-height.
- Prices and times use tabular figures (`font-variant-numeric: tabular-nums`).

Reference renders (must look exactly like this, right-to-left):

| Arabic sentence | Visual order (RTL) |
|---|---|
| تحليل XAUUSD قبل افتتاح وول ستريت عند 15:30 | تحليل ← `XAUUSD` ← قبل افتتاح وول ستريت عند ← `15:30` |
| صدر CPI أعلى من التوقعات | صدر ← `CPI` ← أعلى من التوقعات |
| الذهب XAUUSD +0.42% | الذهب ← `XAUUSD +0.42%` |

## 5. Direction and layout

- Arabic pages: `<html lang="ar" dir="rtl">`. Layout uses logical properties (`margin-inline-start`, `inset-inline-end`) so RTL is composed, not flipped.
- **Never mirror:** the FOXREX logo/mark, the REX mascot, charts, market tickers, timelines, price axes, video/audio controls.
- **Do mirror:** directional arrows in CTAs (`.fx-flip`), progress direction, list/step order.
- Market strips and time sequences stay LTR even on Arabic pages; only their labels are Arabic.

## 6. Social and document formats

Sizes below are for a **1080 px wide** canvas (Instagram post 1080×1350, carousel slide 1080×1350, Story/Reel cover 1080×1920, Telegram card 1280×720 → scale ×1.19). Keep 96 px outer safe margins on posts, 250 px top / 300 px bottom on Stories.

| Level | Weight | Size | Line height | Notes |
|---|---|---|---|---|
| Hook / Display | 700 | 88–104 px | 1.25 | Max 2 lines, break at «...» |
| Slide title (H1) | 700 | 64–72 px | 1.35 | Max 3 lines |
| Section / H2 | 700 | 48 px | 1.45 | |
| Label / kicker | 600 | 30 px | 1.5 | Teal `#00D4A7`, no tracking |
| Body | 400 | 34–38 px | 1.8 | Max ~45 Arabic characters per line |
| Caption / source | 400 | 24–26 px | 1.7 | 62 % opacity light `#E5E7EB` |
| Data (Inter) | 600–700 | 0.94 × context | 1 | Prices/levels up to 120 px on price cards |
| Latin signature | Inter 600 | 22 px | 1 | `TRADE SMARTER. GO FURTHER.`, 0.2em tracking |

Colours: text `#E5E7EB` / `#FFFFFF` on `#0B1320` or `#1F2937`; accent `#00D4A7` (primary), `#00A884` (secondary); bullish `#00D4A7`, bearish `#FF5C7A`, caution `#F5B942`. Reports (A4, print): body 11 pt/1.8, H1 24 pt/1.35, H2 16 pt/1.45, same families.

## 7. Studio

Studio (`/studio/`) loads `styles/fonts.css` and `styles/tokens.css`. Any Arabic output it prepares (captions, carousel copy, Story text, Telegram cards, visual briefs) must specify these tokens and the rules above; image prompts should leave clean space for post-production typography instead of rendering Arabic inside generated images.

## 8. Checklist before publishing Arabic content

- [ ] Arabic set in IBM Plex Sans Arabic (verify, don't assume a fallback)
- [ ] Symbols, numbers, times, % in Inter and isolated LTR
- [ ] No letter-spacing, uppercase or italic on Arabic
- [ ] Headline breaks at «...», no orphan word
- [ ] Logo, mascot, charts and tickers not mirrored
- [ ] No invented prices, results or performance figures
- [ ] Risk line present on signal and analysis content
