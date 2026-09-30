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

**Implementation:** a sculpted, faceted fox head built procedurally from fox anatomy (`js/rex3d.js`) and rendered in WebGL.

- **Anatomy:**
  - A lofted skull that narrows through a clear stop into a long, tapered muzzle and a nose tip.
  - A narrow jaw and a cheek ruff that frames the face.
  - Ears with a wide base, set back on the skull and leaning outward.
  - A sculpted brow ridge, cheekbones and eye sockets.
  - About 860 triangles with architectural faceting: alternating diagonals and small deterministic offsets, not a smoothed animal model.
- **Material:**
  - Smoked graphite on the skull, the bridge of the muzzle and the ear backs.
  - Dark smoked ceramic on the cheeks, lower muzzle and throat. These are the fox markings, blended per vertex so there is no zigzag boundary.
  - An obsidian nose.
- **Lighting:**
  - A soft frontal key and fill, so both halves stay readable with no hard seam.
  - A cool rim and a studio-softbox reflection, so the facets catch light differently.
  - A trace of FOXREX teal, in the reflection only.
  - Warm bounce light from the eyes.
- **Eyes:**
  - Set into sockets under an upper-lid overhang.
  - Amber iris with fibres and a limbal ring, and a soft vertical slit.
  - The lid's shadow, a wet cornea (softbox highlight plus a secondary glint) and faintly reflected market data.
  - Restrained emission; the eyes follow meaningful targets only.
- **Build regions:** every triangle carries a build region (0 PRICE … 9 MEMORY). In **Data formation** each evidence stream travels to its own region and builds it facet by facet.
- **Rendering:** front faces only, since every triangle is wound outward.
- **Swapping in a GLB later:** replace the mesh in `world3d.js`, keep the eye materials, and provide `sampleRexSurface(n)` → `[x, y, z, region]`. The engine drives REX only through `rexS` (position, scale, yaw, pitch, mesh, edge, dissolve, eye).

**Narrative arc:**

1. **First contact:** the eyes alone, large, in near-darkness.
2. **Observation:** large and cropped at the edge of frame, looking inward at the signals FOXREX selects.
3. **Data formation:** built by the ten streams, then clearly readable at completion.
4. **Technical:** a small observer; its gaze and an amber glint find the break of structure.
5. **ML:** dissolves as the candles appear.
6. **Reasoning:** large and partially framed behind evidence in real depth.
7. **Risk:** behind the gate.
8. **Decision:** almost invisible, only the eyes and a silhouette.
9. **Live and System:** a faint signature.

**Visual signature (recurring motifs):**
- **Observation line:** a precise thin line that selects. It appears as brackets and a light path in Observation, stream trails in Data formation, links that grow from evidence to REX's eyes in Reasoning, the edge of the validation pane in ML, and the instrument arcs of the architecture.
- **Intelligence particle:** information that has become intelligence renders as a crisp diamond, not a round dot.
- **Attention (REX's eye):** an amber anamorphic glint at key moments only: the selected signal, and the break of structure.

**Assets used:** the existing assets are the FOXREX brand mark (used in the nav) and `assets/rex/rex-arms.jpg` (116×106, a character illustration). The illustration is too small and too mascot-like for cinematic use, so REX here is a procedural sculpt built from its defining traits: fox ears with a wide base, a cheek ruff, a long tapered muzzle and slanted amber eyes. A commissioned GLB can replace it later (see below). No random fox imagery was introduced.

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

## Owner review tools (development only)

Open `/experience/?review=1`. The review panel is never loaded without that parameter: `js/review.js` is imported only when it is present.

**One command on your machine** (from a checkout of `claude/experience-lab`):
- macOS / Linux: `./experience/review-local.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File experience\review-local.ps1`

This starts `python -m http.server 5180` on 127.0.0.1, leaves it running, and opens `http://localhost:5180/experience/?review=1` in Chrome.

The panel has:
- **Scene navigator.** Buttons and keys `1`–`9`, `0`, `-` jump to the eleven review moments:

  | Key | Moment | Key | Moment |
  |---|---|---|---|
  | `1` | Noise | `7` | Risk gate |
  | `2` | REX first contact (replays the intro from 3.8 s) | `8` | Decision |
  | `3` | Data formation | `9` | Replay |
  | `4` | Technical | `0` | Live |
  | `5` | ML | `-` | System |
  | `6` | Reasoning | | |

  Watchable scenes (data formation, ML, reasoning) jump to their start; press **`P`** to play the current scene hands-free at cinematic pace.

  Other keys: `R` shows REX in the Observation scene; `←` / `→` fine-scrub; `H` hides the panel.
- **REX inspection:** `F` face (three-quarter), `V` front, `S` silhouette (profile, backlit), `E` eyes (close-up), `T` turntable.
- **QA only:** `?adapt=0` freezes quality at full resolution (used for review screenshots).
- **Renderer diagnostics:**
  - browser, WebGL version, unmasked GPU renderer, and hardware vs software rasteriser;
  - device pixel ratio, screen and viewport;
  - live fps, worst frame, DPR, particle count and estimated refresh rate;
  - draw calls, triangles, GPU resources, JS heap (Chrome only) and error count.
- **Benchmark journey.** A steady 45-second scroll through the whole film. It reports:
  - average fps, 1% low, p50/p99 frame time, worst frame, and frames over 33 ms and 50 ms;
  - the DPR range, particle tier, heap before and after, and errors.

  **Copy report** puts the JSON on the clipboard.

**Adaptive quality** (`adaptQuality` in `js/engine.js`):
- It starts at full quality: device DPR up to 2, and the particle tier for the viewport.
- It works relative to the display's refresh interval, so it behaves the same at 60, 120 and 144 Hz.
- First it lowers resolution, with a floor of 0.75 on desktop and 0.6 on mobile. It recovers after sustained fast frames, so a single stall does not lower quality permanently.
- Only if the device is still too slow at the lowest DPR does it drop one particle tier (×0.62).
- Fog, lighting, REX geometry and post-processing are never reduced.
- Scene groups outside the current and next scene stay asleep, meaning they are not rendered.

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

**Performance (measured honestly):**
- **Owner's machine:** hardware-accelerated (GTX 1660 SUPER, 2560×1440, 5,200 particles), about 60 fps before this art-direction pass.
- **Software rendering, this pass:** headless QA runs on SwiftShader (CPU software WebGL, 4 cores), with adaptive DPR at its 0.75 floor. Full-journey averages:

  | Viewport | This pass | Previous pass |
  |---|---|---|
  | 1440×900 | about 19 fps | about 25 fps |
  | 1920×1080 | about 12 fps | about 16 fps |
  | 390×844 | about 44 fps | about 46 fps |

  The larger REX, the depth-of-field market field and the signature motifs cost about a quarter more fill-rate.
- **Heaviest scenes:** Observation, Reasoning and Noise, measured as per-scene frame time at DPR 1.
- **Savings in this pass:**
  - REX renders front faces only.
  - Dissolve noise runs only while dissolving.
  - Invisible sprites and zero-alpha particles are never rasterized.
- **Still to measure:** real-GPU numbers after this pass, on the owner's machine with the **Benchmark journey** button.
