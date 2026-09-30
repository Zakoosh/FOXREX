# FOXREX — "Enter the mind of FOXREX" (experimental prototype)

An isolated cinematic prototype exploring the future visual identity and flagship experience of FOXREX.
**Not production.**

- It is not linked from any production page, not in the sitemap, and marked `noindex`.
- It does not change the homepage, `/ar/`, `/studio/`, the CMS, the publishing engine or any market-data code.
- It reuses the brand fonts (`../styles/fonts.css`) and brand marks read-only.

Preview: serve the repository root with `python3 -m http.server 5180` and open `http://localhost:5180/experience/`. After merge, the prototype lives at `https://foxrex.co/experience/`. The page is JavaScript modules, so it needs to be served over http(s); `file://` will not work.

- `?lang=ar` — Arabic edition (RTL copy; charts, prices and timelines stay LTR)
- `?motion=reduced` — force the reduced-motion version (the OS setting is honoured automatically)

## Engine

| Layer | Choice | Why |
|---|---|---|
| Visual engine | Canvas 2D with a small perspective camera (`js/engine.js`) | One continuous particle world plus crisp vector charts. No WebGL dependency means no WebGL failure mode. |
| Animation | Scroll is the film timeline, eased with inertia, plus `requestAnimationFrame` | 15 scenes; every scene is a *formation* the same particles morph into. |
| 3D | Hand-rolled projection (yaw, depth, camera travel) | Enough for depth, fly-through, orbiting the feature space and REX head turns. Three.js was not needed. |
| Typography / UI | DOM overlay (Inter / IBM Plex Sans Arabic) | Real text, selectable, accessible and translatable. |
| Libraries | none | |

Files:

| File | Contents |
|---|---|
| `index.html` | Stage, overlay and the complete text fallback (for no-JS, errors and screen readers) |
| `experience.css` | Styles |
| `js/engine.js` | Timeline, formations, camera, REX, vector layer and interactions |
| `js/rex.js` | REX geometry |
| `js/indicators.js` | Genuine indicator maths |
| `js/demo-data.js` | **DEMO_DATA** |
| `js/copy.js` | EN / AR copy |
| `js/sound.js` | Opt-in sound |

## Scene system (one world, transforming)

The same particle population morphs through each stage:

noise field → attention lanes → ten evidence streams spiralling into REX → six architecture rings the camera flies through → XAUUSD candles → remembered market states receding in depth → dataset grid → feature axes → clusters with a decision boundary and a walk-forward window → nine evidence nodes streaming into REX → the risk gate → a single price horizon → the replayed chart → evidence around REX (Ask) → a six-market constellation → the full architecture path.

Morphs are staggered per particle, so objects *become* the next thing instead of fading between sections.

## REX

**Implementation:** a procedural faceted fox head (`js/rex.js`).

- It is 3D line geometry: silhouette, ear triangles, brow, facial mask and muzzle ridge, with depth so the head can turn.
- It renders two ways: as particles that dissolve into data and re-form, and as crisp line-art once organised.
- The eyes are narrow, slanted and amber with a vertical slit. They track targets such as volatility, the latest candle, evidence nodes and the selected market, blink, and narrow when the scene is about risk.
- Loading behaviour is a teal scan across the eyes; there is no spinner.

**Narrative arc:**

1. Eyes only, far away in the dark.
2. Silhouettes forming from observations.
3. Formed by the data streams ("it was always watching").
4. A small observer beside the chart.
5. Dissolved into the ML feature space.
6. Fully recognisable in the reasoning chamber, where it waits.
7. Stopped behind the risk gate.
8. Perfectly still at the decision; the environment keeps moving.
9. Explaining in Ask REX.
10. A faint signature at the centre of Live Intelligence and the System.

**Assets used:** the existing assets are the FOXREX brand mark (used in the nav) and `assets/rex/rex-arms.jpg` (116×106, a character illustration). The illustration is too small and too mascot-like for cinematic use, so REX here is a *premium placeholder silhouette system* derived from its defining traits: tall pointed ears, cheek ruff, narrow muzzle and slanted amber eyes. No random fox imagery was introduced.

### Asset plan — `REX_3D_ASSET_REQUIRED=YES`

For the final flagship version, commission a REX model that matches the approved identity.

**Model**
- Head and neck bust, plus an optional full-body walk cycle.
- Stylised realism: *not* cartoon, *not* robotic.
- Faceted/low-poly **and** smooth-surface variants from the same topology.

**Geometry and rig**
- ≤ 40k triangles (head ≤ 15k); clean quads for subdivision.
- Rig: separate eyelid and ear bones; eye rig driven by a look-at target; neck yaw/pitch.
- Blend shapes: `focus` (eyes narrow), `alert` (ears forward), `blink`.

**Materials**
- PBR in two variants: dark-fur, and a "data" variant with emissive facet edges (teal `#00D4A7` at ≤ 20% intensity).
- Separate amber eye material with emissive slit pupils.

**Delivery**
- glTF 2.0 / GLB, Draco-compressed, ≤ 2.5 MB. KTX2 textures at 2K (1K on mobile).
- Animation clips: `idle_breathe`, `track_left/right`, `still`, `dissolve` (vertex-order-stable for particle sampling), `walk_loop`.
- Point-sample export: 4,096 surface points with normals (JSON) for the particle formations.
- Layered 2D alternative for low-end devices: SVG line-art plus eye layers as separate groups.

| What | Status |
|---|---|
| Procedural (done) | particles, streams, charts, feature space, gate, constellation, REX line-art |
| Needs SVG | refined REX line-art, the final signature mark |
| Needs layered artwork | a REX reflection plate for glass/reflection moments |
| Needs a 3D model | the REX bust / walk above |
| Image sequences | none required |

## Data

Everything market-like is **DEMO_DATA** (`js/demo-data.js`) and labelled on screen ("DEMO / CINEMATIC DATA — not live market data").

- **XAUUSD series:** 262 one-minute candles, seeded and deterministic. EMA 20/50/200, Bollinger 20,2, RSI 14, MACD 12,26,9, ATR 14 and ADX 14 are *computed* from it (`js/indicators.js`). Structure is detected: HH/HL/LH/LL, BOS at 09:33, retest at 09:36. The replay narration matches the computed data.
- **Other values:** evidence, the replay states, the decision, the risk cases, the Ask REX answers and the six-market constellation are illustrative prototype values.
- **Not claimed anywhere:** win rate, profit, returns, user counts or model accuracy.
- **Isolation:** the demo data is never imported by production code, the CMS, the publishing feed or signal results.
- **Live data rule:** `<meta name="foxrex-market-api">` is empty, so Live Intelligence shows **MARKET DATA UNAVAILABLE** with the values marked DEMO.

## Interactions (real)

- Scroll-scrubbed film with inertia.
- Minimal navigation that becomes defined as you go deeper, plus a progress rail.
- Replay scrubber: a range input (mouse, touch, keys) plus event buttons. Rewinding rewinds the chart, evidence, confidence, risk state, decision state and REX's attention.
- Ask REX questions highlight their evidence, and REX looks at it.
- Market nodes can be hovered, clicked, tapped or focused. Focus draws illustrative relationship lines and a detail panel.
- The cursor subtly parts particles on desktop.
- Sound is opt-in only.

## Mobile, reduced motion, performance

**Mobile / tablet:** a separate choreography, not a shrunk desktop.
- About 1,000 particles (1,800 on tablet, 2,600 on desktop); DPR is capped at 1.5.
- Fewer candles, a vertical architecture path, and panels below the world instead of beside it.
- A narrower camera travel.

**Reduced motion:**
- No inertia, drift, camera travel, blur or staggered morphs; scenes switch cleanly as you scroll.
- The story and every interface remain.

**No JavaScript or an error:** the full narrative as text.

**Performance:**
- Particles are drawn in one pass per colour, with no per-frame layout reads other than `scrollY`.
- DOM writes are limited to transforms and opacity, only for the active scene's elements.
- Measured about 60 fps average across a full scripted scroll at 1440×900 in headless Chromium, with a worst frame of about 24 ms.
