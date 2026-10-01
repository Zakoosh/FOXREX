# FOXREX experience: revised visual plan (v2)

Status: **PLAN ONLY, waiting for owner approval.** Nothing in this document is implemented.
Next gate: **VISUAL PLAN APPROVED BY OWNER.** PR #7 stays a draft. Production is untouched.
The current prototype (commit `49f04d7`) is kept in git history as-is.

---

## 0. What changes, in one paragraph

The approved **Market Noise** opening becomes the whole film. Visitors stay inside one continuous market world:
real financial fragments at many depths, some sharp and some blurred, with the camera always moving forward.
Every later scene happens **inside that same world**: the noise organises itself, evidence lights up, and the
noise falls away until one clear picture is left. REX is not drawn by code any more. REX is the established
**Higgsfield REX-MASTER** character, delivered as footage and stills and composited *into* the market world
(behind panels, through blur, with market light reflected on fur and eyes). Three.js only handles depth,
light, focus and camera around that artwork. It no longer invents the artwork.

Six scenes instead of fifteen:

| # | Scene | Scroll share | Story beat | REX |
|---|---|---|---|---|
| 01 | MARKET NOISE | 18% | Hundreds of competing signals | Hidden, then two amber eyes at the very end |
| 02 | REX OBSERVES | 16% | Something is watching the market | Eyes → partial face → three-quarter view |
| 03 | FOXREX UNDERSTANDS | 20% | Chaos turns into structure | Soft silhouette behind the focus plane |
| 04 | FOXREX REASONS | 18% | Evidence inside the market, and why the view changes | Close profile, attention moving between pieces of evidence |
| 05 | THE DECISION | 14% | The same market, now understandable | Leaves the frame. Clarity is the payoff |
| 06 | LIVE INTELLIGENCE | 14% | The film becomes the product | Not in the world. Small "AI state" mark only |

---

## A. Revised scene architecture

### A.1 One world, one camera, one set of market objects

The same **market set** of about 40 panels (the current Market Noise primitives) exists from the first frame to the last.
Scenes never swap in a new environment. They change four things about the same world:

1. **Focus**: which depth plane is sharp (the focal distance and aperture of the depth of field).
2. **Selection**: which panels FOXREX holds. They stay lit and in focus while the rest dims and falls out of focus.
3. **Arrangement**: in 03–05 the selected panels move into one readable XAUUSD composition.
4. **REX**: a footage layer placed at a real depth inside the field, so panels pass in front of and behind it.

### A.2 Compositing stack (back → front)

| Layer | Content | Notes |
|---|---|---|
| L0 Atmosphere | Near-black navy gradient (`#0B1320`), slow volumetric haze, film grain | Grain and lens overlay as today |
| L1 Far field | Market panels 8–13 units deep, blurred sprite variants, low opacity | Today's far field |
| L2 **REX plate** | Higgsfield footage or stills on a plane at depth 3.5–6 | Black-background footage composited with a luma/screen key (see B.2); blur matched to depth |
| L3 Focus plane | The panels FOXREX selects, in focus | Today's "signal" primitives |
| L4 Glass / reflection | Market text and candles reflected onto REX's eyes and fur, cropped to REX's highlights | This is what ties REX into the world |
| L5 Near field | Very large, very soft fragments passing the lens (`4328.50`, `CPI`, `DXY`) | Today's near primitives, larger |
| L6 DOM type and UI | Hero lines, small labels, decision panel, live panel, DEMO label | Real text: accessible, translatable, Arabic RTL |

### A.3 Scenes

**01 MARKET NOISE** (keep and refine the approved opening)
- World: the current field, made denser and more financial. Panel set: XAUUSD price, 1m candlesticks, volume,
  economic calendar (CPI, ISM, FOMC), Fed headlines, DXY, US10Y yield curve, EURUSD, market structure
  (HH/HL, BOS), ATR, MACD, session, spread, news fragments, depth-of-market ladder, tick tape.
- Camera: slow, constant forward travel through the panels, with gentle lateral drift and parallax at three depths.
  Focus "breathes": every few seconds a random panel sharpens and then lets go. Nothing gets held yet.
- Type: `THE MARKET IS NOISE.` then `UNTIL YOU KNOW WHAT TO LOOK FOR.` (current hero type tier).
- Exit: the drift slows. Deep in the field, behind the calendar panel, two amber points catch light (asset **R-01**).
- Changes from today: the procedural eyes go (replaced by R-01). The point-cloud "dust" becomes a sparse haze.
  Headline / Fed / DXY panels get more weight. The camera travels forward instead of letting panels drift past.

**02 REX OBSERVES** (same world, same motion; REX is revealed inside it)
- 02a Eyes: R-01 holds deep in the field. Panels keep passing **in front of** the eyes, so they are seen *through* the market.
- 02b Partial face: R-02. The camera keeps pushing in, the eyes come into focus and the fur edge catches teal rim light.
  A blurred calendar panel crosses in front of the face, and its numbers reflect in the eye (L4).
- 02c Three-quarter view: R-03. REX's head turns slightly toward a chart panel on screen-left. The gaze drives
  selection: the panel REX looks at becomes the sharpest object on screen.
- Type: `OBSERVE EVERYTHING.` / `CHASE NOTHING.`
- Not a mascot reveal: REX is never fully lit, never centred and never larger than about 45% of the frame height.

**03 FOXREX UNDERSTANDS** (chaos → structure)
- REX recedes to a soft silhouette (R-04) behind the focus plane, still watching.
- The scattered panels start organising. Candle fragments slide into one time-aligned XAUUSD 1m candlestick
  series, and the structure resolves in order:
  1. **Candles** line up into one chart (price becomes readable).
  2. **Trend**: EMA 20/50/200 draw through the candles.
  3. **Structure**: HH / HL labels attach to the real swing points.
  4. **Volatility**: a Bollinger envelope and the ATR value settle.
  5. **Momentum**: the MACD histogram forms beneath.
- At each step the panels that contributed snap into focus. Anything not used (headlines that don't matter,
  unrelated pairs, the depth ladder) loses focus and opacity and drifts back. Intelligence is shown as
  **focus and order**, not as a brain, a network or particles.
- Type: one quiet line per step (`Price.` `Trend.` `Structure.` `Volatility.` `Momentum.`), small and anchored to the chart.

**04 FOXREX REASONS** (evidence inside the market, not floating cards)
- The chart from 03 stays where it is. Evidence is marked **on the market itself**:
  - trend highlight along the EMA stack;
  - **BOS** line breaks and labels at 09:33;
  - **retest** appears at 09:35 and holds;
  - volatility state resolves ("ATR normal");
  - momentum confirms (MACD crosses);
  - risk zone shades under the invalidation level;
  - **macro event risk** stays visible: the CPI 08:30 calendar row keeps hanging in the field, sharp and amber;
  - ML probability appears **subtly** as a small `P(continuation) 0.72 DEMO` tag next to the last candle, not a scene of its own.
- The "why the view changes" beat (it follows the DEMO decision replay data):
  - 09:31: an early long into resistance is rejected (reward/risk 0.8, volatility elevated). The view is `WAIT`.
  - 09:33: the BOS breaks 4,323.5. The view is still `WAIT`, pending a retest.
  - 09:36: the retest holds, momentum confirms and ML improves to 0.72. Risk passes at reward/risk 1.5.
  - 09:38: `BUY`.

  A small state label beside the chart changes `WAIT → BUY`, and the evidence that caused each change lights up at that moment.
- REX: R-05, a close profile at the frame edge, eye moving from evidence to evidence. The amber attention glint
  (current motif) travels along the same path.
- Type: `Evidence converges.` / `Some of it disagrees.` / `FOXREX waits.` → `Then it doesn't.`

**05 THE DECISION** (the same market, now clear)
- Everything unused fades out. What's left is the XAUUSD chart, the BOS/retest, the risk zone, the target
  and the CPI row: one clear market picture in the same place, at the same depth and on the same panels as the noise.
- REX has left the frame (the R-05 plate fades back into the dark). There is no mascot and no explosion.
- Decision panel (restyled from the current DOM decision panel): `BUY` (with `SELL` and `WAIT` shown dim
  beside it so the visitor sees it was a choice), confidence 0.72, risk 0.5% per position, invalidation 4,313.80,
  target 4,351.00, and three lines of reasoning. Labelled DEMO.
- The contrast is the story: for one beat the camera pulls back so the visitor sees the noise field faintly
  behind the clear picture.

**06 LIVE INTELLIGENCE** (the film becomes the product)
- The XAUUSD chart moves into the first of six panels in the **same visual language** (same panel
  style, depth and focus): XAUUSD, EURUSD, GBPUSD, USDJPY, BTCUSD, ETHUSD.
- Each panel shows trend, regime, volatility, signal state and AI state.
- The data rule stays the same: values come only from the real FOXREX Market API (`<meta name="foxrex-market-api">`).
  Without it, every panel shows **MARKET DATA UNAVAILABLE**, and demo values are clearly labelled DEMO.
- REX appears only as a small "AI state" mark (asset R-07, optional). End links: `Enter FOXREX` and `Return to foxrex.co`.

### A.4 Product and technical constraints carried over
- No-JS / no-WebGL text fallback, `?renderer=2d` fallback, reduced motion, Arabic RTL, sound off by default, skip link.
- If the REX assets fail to load or are absent, the film still works and simply shows no REX. It **never** falls back to a procedural fox.
- Only one REX video decodes at a time and the next one is preloaded. Every video has a poster frame. Desktop gets 2560 px and 1920 px encodes; mobile gets 1280 px.
- Real-GPU budget stays 60 fps target / 45 fps floor at 2560×1440 on a GTX 1660 SUPER-class GPU.

---

## B. REX assets needed from Higgsfield

All assets come from the existing Higgsfield element **REX-MASTER** (`a9854611-9030-4a9d-b1da-ad7e1185e80e`,
"Official FOXREX REX master character: face, amber eyes, orange-white fur markings, ears, muzzle, proportions,
large tail, black FOXREX streetwear, teal accents"). Nothing is redesigned. Each shot is made in two steps:
**key still first → owner approves → image-to-video from the approved still**, so the identity is locked
by the still and not re-invented by the video model.

### B.1 Shot list

| ID | Shot | Used in | Type | Length / loop | Required |
|---|---|---|---|---|---|
| **R-01** | Eyes in darkness: both amber eyes, faint fur rim, nothing else | 01 end, 02a | Video | 6 s, seamless loop (slow blink at 3 s) | Yes |
| **R-02** | Partial face emerging: three-quarter crop of eyes, brow, ear edge and muzzle edge, teal rim, slow push-in | 02b | Video (one-shot) + key still | 7 s | Yes |
| **R-03** | Three-quarter head and shoulders, observing: jacket collar visible, head turns slightly to screen-left toward something off-frame | 02c | Video + key still | 6 s | Yes |
| **R-04** | Backlit silhouette: head and shoulders in near-silhouette, only rim light (teal + warm), still and watching | 03 | Still (+ optional 5 s breathing loop) | — | Yes |
| **R-05** | Close profile, reasoning: side view, eye in focus, gaze shifts left→centre→right in three small steps | 04 | Video | 8 s | Yes |
| **R-06** | Eye macro: one amber eye filling the frame, slit pupil, wet cornea, dark empty reflection area for compositing | 02b→03 transition, reflections | Still, 4K | — | Yes |
| **R-07** | Small AI-state mark: REX head, three-quarter, clean, centred, for a 64–96 px live-panel mark | 06 | Still | — | Optional |
| **R-08** | Walking through: full-figure side view, REX walks slowly left→right, hands in jacket pockets | Alternative 03 transition | Video | 8 s | Optional |

### B.2 Delivery specification (applies to all shots)

- **Background: pure black (#000000), with no environment, no floor and no fog.** We composite into the market world
  with a luma/screen key. Fur on black keys cleanly; green screen on fur does not. Higgsfield background removal
  can also produce alpha PNGs for the stills.
- **Do not let the model paint charts, numbers, UI, logos or text into the footage.** All market content and reflections
  are added in compositing so they are real, consistent and labelled DEMO. Generated "data" would be fabricated.
- Lighting language (same for every shot so the cuts match):
  - soft warm key from screen-right, low, as if lit by a screen;
  - **teal rim (#2FE0B8)** from behind screen-left;
  - deep falloff to black and no fill;
  - eyes slightly self-luminous amber (#F5B942).
- Camera: 85 mm–135 mm look, shallow depth of field, eye-level or slightly below. Locked-off or a very slow push. No handheld shake.
- Output: 16:9, 3840×2160 preferred (2560×1440 minimum), 24 fps, ungraded/neutral (we grade in WebGL). Lossless or high-bitrate MP4 master plus the key stills as PNG.
- Performance: subtle. Blinks, micro-movements of ears and whiskers, slow breathing, eye saccades. No talking, no smiling, no paws or hands in frame except R-08.
- Identity checks before a shot is accepted:
  - the face, markings and amber eyes match REX-MASTER;
  - the jacket is black with teal accents;
  - there is no drift in face shape across the clip;
  - there are no extra ears or whiskers and no artefacts around the eyes.

Planned folder (not created yet): `experience/assets/rex/` with `R-0X.webm` (VP9), `R-0X.mp4` (H.264/HEVC),
`R-0X-poster.jpg` and `rex-assets.json`. The manifest holds the shot id, depth, focus, key mode and loop range.

---

## C. Higgsfield prompt and shot specification

Notation: `<<<REX-MASTER>>>` is the Higgsfield element placeholder for `a9854611-9030-4a9d-b1da-ad7e1185e80e`.
Recommended models (all support Elements):
- **Stills:** Cinema Studio Image 2.5 or Nano Banana Pro.
- **Video:** Cinema Studio Video 3.0, Kling 3.0 or Seedance 2.0, run image-to-video from the approved still.

The same **negative / avoid list applies to every shot:** text, letters, numbers, charts, UI, screens, logos, watermark, background
environment, floor, smoke, particles, extra ears, extra eyes, deformed muzzle, cartoon style, low-poly, wireframe,
plastic look, smiling, open mouth, teeth, paws in frame, camera shake, colour grading, lens flare.

**R-01 · Eyes in darkness** (video, 6 s loop)
- Key still prompt:
  > Extreme low-key cinematic close-up of <<<REX-MASTER>>> in total darkness. Only the two sharp amber eyes are visible, softly self-luminous, slit pupils, with a faint thread of orange-and-white fur catching a thin teal rim light (#2FE0B8) along the brow. The face is otherwise lost in pure black. Calm, intelligent, watchful expression. 135mm lens, very shallow depth of field, eye level, perfectly centred eyes at 16:9. Pure black background, no environment.
- Video prompt (image-to-video from the approved still):
  > Locked-off camera. The eyes stay still and watchful; one slow natural blink at the midpoint; tiny saccade to the left and back. Fur rim breathes very slightly. Nothing else moves. Seamless loop. 6 seconds.

**R-02 · Partial face emerging** (video, 7 s, one-shot)
- Key still:
  > Cinematic three-quarter close-up of <<<REX-MASTER>>>, framed from the eyes up to the tip of one ear, cropped so the right half of the face is out of frame. Amber eyes in sharp focus, white cheek fur and orange fur texture visible, teal rim light (#2FE0B8) from behind-left outlining the ear and brow, soft warm key light from low screen-right as if lit by a monitor, everything else falls to pure black. Confident, cunning, observing expression. 85mm, f/1.8 shallow depth of field. Pure black background.
- Video:
  > Very slow push-in toward the eyes. The face emerges from darkness: light gradually wraps further across the fur from the right. Eyes stay focused on something just past the camera. One subtle ear twitch. No head movement. 7 seconds.

**R-03 · Three-quarter observing** (video, 6 s)
- Key still:
  > Cinematic three-quarter portrait of <<<REX-MASTER>>>, head and shoulders, wearing the black premium FOXREX jacket with teal accents at the collar. Positioned on the right third of a 16:9 frame, looking toward screen-left at something off-frame with calm focus. Sharp amber eyes, orange fur with white muzzle and cheeks, teal rim light from behind-left, low warm key from the right, deep falloff to pure black. Premium, restrained, intelligent. 85mm, shallow depth of field. Pure black background, no environment.
- Video:
  > Locked-off camera. REX turns his head a few degrees further to screen-left, as if noticing a detail; eyes lead the movement, then settle. A slow breath lifts the collar slightly. 6 seconds.

**R-04 · Backlit silhouette** (still, optional 5 s loop)
- Still:
  > <<<REX-MASTER>>> in near-total silhouette, head and shoulders in three-quarter view facing screen-left, standing still. Lit only from behind: a thin teal rim (#2FE0B8) along the ear, cheek fur and jacket shoulder, and a faint warm rim on the other side. The amber eyes glow faintly. The rest of the figure is black against pure black. Calm, watching. 16:9, figure on the right half of the frame, 50mm.
- Loop (optional):
  > Locked-off. Barely perceptible breathing; one slow blink. 5 seconds, seamless loop.

**R-05 · Close profile, reasoning** (video, 8 s)
- Key still:
  > Cinematic side-profile close-up of <<<REX-MASTER>>> facing screen-left, framed from the nose tip to behind the ear, on the right edge of a 16:9 frame. Amber eye in sharp focus, muzzle and whiskers precise, orange and white fur detail, black jacket collar just visible. Thin teal rim from behind, soft warm key from the front-left as if lit by a screen in front of him. Concentrated, analytical expression. 100mm macro feel, very shallow depth of field. Pure black background.
- Video:
  > Locked-off camera. Only the eye moves: three small deliberate saccades (far left, centre, near right), pausing about two seconds on each, as if reading evidence. One slow blink before the final look. Ears turn slightly with the last look. 8 seconds.

**R-06 · Eye macro** (still, 4K)
- Still:
  > Macro close-up of one amber eye of <<<REX-MASTER>>>, filling the 16:9 frame horizontally. Vertical slit pupil, fibrous iris detail, wet glossy cornea with a large clean dark reflection area across the upper half (left empty for compositing), surrounding orange and white fur in fine detail, teal rim catching the lid. Pure black around the edges. Extremely sharp.

**R-07 · AI-state mark** (still, optional)
- Still:
  > Clean three-quarter head portrait of <<<REX-MASTER>>>, centred, facing slightly left, calm and intelligent expression, amber eyes, black FOXREX jacket collar with teal accent, soft studio light with teal rim, pure black background. Composed to read clearly at a very small size. Square 1:1.

**R-08 · Walking through** (video, optional)
- Key still:
  > Full-figure side view of <<<REX-MASTER>>> walking slowly from left to right, hands in the pockets of the black FOXREX jacket, large tail visible, sneakers, composed and unhurried. Teal rim light from behind, warm key from the front, pure black background, no floor visible. 16:9, figure small in the lower-centre of frame, 50mm.
- Video:
  > Camera tracks sideways at walking speed so REX stays in frame. Calm, deliberate pace; head turns once toward camera-right as if glancing at something. 8 seconds.

---

## D. Prototype components that will be reused

| Component (today) | File | Reuse in v2 |
|---|---|---|
| Market primitive renderer (`primitiveCanvas`: candles, volume, ladder, yield curve, calendar, depth, structure, headline, ticks, sparkline) | `js/world3d.js` | **Core of every scene.** Add DXY, Fed headline, session/spread and news-wire variants. |
| Sharp + blurred texture pairs and the depth-of-field focus model (`blurred`, `updatePrims` focus/aperture) | `js/world3d.js` | Core. Depth of field becomes the main storytelling tool (focus = attention). |
| Signal / noise selection (`signal` flags, `SIG_ANCHOR`, dimming of non-signal panels) | `js/world3d.js` | Basis of 02 (gaze-driven focus) and 03 (organisation). |
| Floating DOM fragments + large hero type tiers (`xp-opening`, `.st--hero`, `fragments()`) | `index.html`, `experience.css`, `js/engine.js` | Scene 01 type and near-field fragments. |
| Observation-line brackets + amber attention glint motifs | `js/world3d.js` | Kept: brackets mark what FOXREX holds; the glint links REX's eye to evidence in 04. |
| DEMO data, indicators (EMA, Bollinger, RSI, MACD, ATR, ADX, structure/BOS), `DECISION`, `MARKETS` | `js/demo-data.js`, `js/indicators.js` | Scenes 03–06 (unchanged, still labelled DEMO). |
| Chart builder (candles, EMA lines, labels) | `js/world3d.js` `buildChart/updateChart` | Rebuilt so panels *assemble into* the chart (03); styling restrained. |
| Decision panel DOM | `index.html #xp-decision` | Scene 05 (restyled; BUY/SELL/WAIT row). |
| Live panel DOM + Market API meta + MARKET DATA UNAVAILABLE rule | `index.html #xp-live`, `js/engine.js` | Scene 06, restyled to the market-panel language. |
| Camera/scroll engine, adaptive quality, reduced motion, 2D + no-JS fallbacks, sound toggle, skip link, nav | `js/engine.js` | Kept; scene table shortened to 6. |
| Copy system EN/AR | `js/copy.js` | Kept; new lines added, old lines removed. |
| Owner review tool `?review=1`, benchmark, local launchers | `js/review.js`, `review-local.*` | Kept; moments re-pointed to the new storyboard frames. REX inspect keys replaced with an asset/shot inspector. |
| Lens overlay + grain | `experience.css` | Kept. |

## E. Components that will be removed (kept in git history at `49f04d7`)

| Component | Why |
|---|---|
| Procedural REX head `js/rex3d.js` and the REX/eye shaders (`REX_FS`, `EYE_FS`), REX build/reveal regions, REX inspect modes | REX comes from Higgsfield; code must not invent the character. |
| 2D line-drawn fox `js/rex.js`, `aimRex`, `drawRexLines`, `drawEyes` | Same. |
| Procedural eyes in Market Noise | Replaced by R-01. |
| 5,200-point particle system and the `formation()` shapes (noise cloud, streams, candles-from-points, memory clusters) | Generic point clouds; replaced by panels organising themselves. A sparse haze stays as atmosphere only. |
| Scene **Streams** (ten flows building REX) | Particle demo; REX is no longer built from data. |
| Scene **Enter FOXREX** layer stack | Folded into 03's transition. |
| Scene **Technical vision** as a separate 12-step indicator scene | Folded into 03 (five steps, on the assembled chart). |
| Scene **Market memory** (scatter of past states) | Scientific-plot look; not in the new story. |
| Scene **FOXREX ML** (feature space, clusters, walk-forward glass pane, halos) | Abstract ML visual; ML survives only as a subtle probability tag in 04. |
| **Reasoning chamber** (light pool, ring, growing links) and floating evidence cards | Replaced by evidence marked on the market itself. |
| Scene **Risk gate** as a separate scene | Folded into 04 (WAIT → BUY beat) and 05 (risk/invalidation). |
| Scenes **Decision replay** and **Ask REX** | Product features, not part of the film; candidates for the real product later. |
| Scene **FOXREX system** (nine-station pipeline) | Diagram feel; the end is the product (06). |
| 3D grids, wireframe edges, decorative lines, stars/particles without a narrative job | "Three.js demo" signals. |

---

## F. Storyboard

Twelve 1920×1080 frames were delivered with this plan for review. They are not committed, so the repo keeps no image weight. The base plates are **real captures of the approved
Market Noise scene**. REX appears only as labelled **asset slots** (amber dashed frames with the shot ID).
These are composition intent, not final renders. The storyboard deliberately draws no fox.

| Frame | Scene | What the visitor sees |
|---|---|---|
| 01A | Market noise | The approved field, camera travelling forward; `THE MARKET IS NOISE.` |
| 01B | Market noise → | `UNTIL YOU KNOW WHAT TO LOOK FOR.`; deep in the field, behind the calendar, the R-01 eyes |
| 02A | REX observes | Panels pass in front of the R-01 eyes; the field keeps moving |
| 02B | REX observes | R-02 partial face on the right third; calendar panel crosses in front; numbers reflected in the eye |
| 02C | REX observes | R-03 three-quarter view looking left; the chart he looks at is the only sharp panel; `OBSERVE EVERYTHING. / CHASE NOTHING.` |
| 03A | Understands | R-04 silhouette recedes; candle fragments slide into one time axis |
| 03B | Understands | One XAUUSD chart: EMAs, HH/HL, Bollinger, MACD resolved; unused panels blurred and dim |
| 04A | Reasons | BOS line + label at 09:33; state `WAIT · pending retest` (09:31 early entry rejected, R:R 0.8); CPI row amber in the field; R-05 profile at the edge |
| 04B | Reasons | Retest holds at 09:36; momentum confirms; risk zone shaded; `P(continuation) 0.72 DEMO`; state `WAIT → BUY` |
| 05A | Decision | Noise gone; one clear picture; decision panel: BUY (SELL / WAIT dim), confidence, risk, invalidation, target, reasons |
| 05B | Decision | Camera pulls back; the noise field faintly behind the clear picture (the contrast) |
| 06A | Live | Six market panels in the same language; MARKET DATA UNAVAILABLE / DEMO rules visible |

---

## Open questions for the owner

1. **REX footage scope.** Are six required shots (R-01 to R-06) right, or should the first build use **stills only**
   (R-01/R-03/R-04/R-06 as stills with subtle WebGL parallax and blink masks) and add video later?
2. **Jacket visibility.** Should the jacket (black with teal accents) be visible from R-03 onward, or should REX stay face-only until the final mark?
3. **Decision beat.** Keep the `WAIT → BUY` turn in 04 (it shows *why* the view changes), or show only the final BUY in 05?
4. **Who generates the shots.** Does the owner run them in Higgsfield, or should Claude submit them through the
   connected Higgsfield account? Generating them uses credits, so nothing has been generated yet.
