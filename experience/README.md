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

A hybrid: **WebGL (Three.js) for the world**, DOM for the typography and interfaces, SVG/Canvas only where they are the better tool.

| Layer | Choice | Why |
|---|---|---|
| World renderer | Three.js r170, WebGL2 (`js/world3d.js`, vendored at `vendor/three.module.min.js`, MIT) | Real camera depth, perspective, per-scene lighting, exponential fog, depth of field on the particles, 3D objects and a lit REX mesh. |
| Timeline / choreography | `js/engine.js` | Scroll is the film timeline (eased, with inertia). The engine owns formations, the camera narrative, REX behaviour and interactions, and hands the renderer one state object per frame. |
| Particles | One `THREE.Points` field with custom shaders (depth-of-field circle of confusion, fog, per-particle alpha/size) | The same population morphs through every scene. |
| REX | Procedural faceted mesh with custom shading (key/fill/specular, fresnel rim, noise dissolve into data, scan bands) and a separate eye shader (amber iris, vertical slit, reflected market text, glint) | No GLB yet, and no cheap fake 3D animal. See *Asset plan*. |
| Typography / UI | DOM overlay (Inter / IBM Plex Sans Arabic) | Real text: selectable, accessible and translatable. Some labels live in 3D space as sprites. |
| Lens | CSS film grain and vignette | Cheap, and it does not touch the GPU budget. |
| Fallback | The original Canvas 2D engine | Used automatically when WebGL is unavailable or fails, or forced with `?renderer=2d`. |

- **Camera:** the camera travels through the world. It pushes in at the opening, flies through the architecture, orbits the chart and the feature space, pulls focus in the reasoning chamber and locks off at the decision.
- **Lighting:** each scene has its own look: fog density, exposure, a volumetric beam, rim and key light, and aperture. Teal is used sparingly.
- **Depth layers:** foreground, midground, background and far background. Every scene is built from these.
- **Performance budget:**
  - Adaptive DPR: it drops when frames run slow and recovers when they are fast.
  - Particle counts by device tier: 5,200 desktop, 3,200 tablet, 1,800 mobile.
  - Scene objects are built lazily and stay asleep (invisible) unless their scene, or the next one, is on screen.
  - Geometry and materials are reused.
- **QA hook:** `window.FOXREX_XP.state()` (read-only) returns the scroll position, scene, renderer and DPR.

Files:

| File | Contents |
|---|---|
| `index.html` | Stage (WebGL canvas, 2D fallback canvas, lens), overlay, and the complete text fallback |
| `experience.css` | Styles |
| `js/engine.js` | Timeline, formations, camera narrative, REX behaviour, DOM layer, interactions, and the 2D fallback renderer |
| `js/world3d.js` | WebGL world: particles, REX mesh and eyes, scene objects, lighting and fog |
| `vendor/three.module.min.js` | Three.js r170 (MIT, see `vendor/THREE-LICENSE.txt`) |
| `js/rex.js` | REX line geometry (used by the 2D fallback) |
| `js/indicators.js` | Genuine indicator maths |
| `js/demo-data.js` | **DEMO_DATA** |
| `js/copy.js` | EN / AR copy |
| `js/sound.js` | Opt-in sound |

## Scene system (one world, transforming)

The same particle population morphs through each stage:

noise field → attention lanes → ten evidence streams spiralling into REX → six architecture rings the camera flies through → XAUUSD candles → remembered market states receding in depth → dataset grid → feature axes → clusters with a decision boundary and a walk-forward window → nine evidence nodes streaming into REX → the risk gate → a single price horizon → the replayed chart → evidence around REX (Ask) → a six-market constellation → the full architecture path.

Morphs are staggered per particle, so objects *become* the next thing instead of fading between sections.

## REX

**Implementation:** a procedural faceted fox-head mesh rendered in WebGL (`createWorld` in `js/world3d.js`).

- **Material:** obsidian, with lighting from a cool key, a warm fill (kept low), a specular highlight and a teal fresnel rim.
- **Dissolve:** it can dissolve into data along a noise edge and re-form from it.
- **Particle formations:** they sample the same surface (`sampleRexSurface`), so particles can *become* REX.
- **Eyes:** a separate shader, amber and slanted with a vertical slit, reflecting market text. The eyes blink, narrow on risk, and follow meaningful targets such as the latest candle, evidence and the selected market. They follow the cursor only when it is near a meaningful object.
- **Swapping in a GLB later:** replace the mesh in `world3d.js` with the loaded model and keep the eye materials and `sampleRexSurface`. The engine drives REX only through the state it hands over (`rexS`: position, scale, yaw, pitch, mesh, edge, dissolve, eye), so nothing else changes.

**Narrative arc:**

1. **First contact:** the eyes alone in near-total darkness, reflecting market text, then gone.
2. **Observation:** a lit silhouette with depth, with data passing in front of it, behind it and across it.
3. **Data formation:** the ten evidence streams form REX, which then gives way to the architecture.
4. **Technical:** a small observer whose attention follows price, structure, volatility and the breakout.
5. **ML:** it dissolves into the feature space.
6. **Reasoning:** it re-forms behind the evidence in the dark chamber and waits.
7. **Risk:** stopped behind the gate.
8. **Decision:** perfectly still while the environment keeps moving.
9. **Ask REX:** it explains.
10. **Live and System:** a faint signature.

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
- WebGL: 1,800 particles on mobile and 3,200 on tablet, with adaptive DPR.
- Fewer candles, a vertical architecture path, and a 3-column docked market row.
- Panels sit below the world, and the camera travel is narrower.

**Reduced motion:**
- No inertia, drift, camera travel or staggered morphs; scenes switch cleanly as you scroll.
- The story and every interface remain.

**No WebGL:** the Canvas 2D engine takes over automatically.

**No JavaScript or an error:** the full narrative as text.

**Performance (measured honestly):** headless QA ran on SwiftShader, which is CPU software WebGL with no GPU, on 4 cores. Adaptive DPR fell to its floor of 0.75. Averages across a full scripted scroll:

| Viewport | Average fps |
|---|---|
| 1440×900 | about 25 |
| 1920×1080 | about 16 |
| 390×844 | about 46 |

These are lower bounds. Real-GPU numbers have not been measured here and should be checked on target hardware before any production decision.
