/* FOXREX experience v2 — REX COMPOSITING LAYER.
   REX is the established Higgsfield REX-MASTER character. This module never draws REX: it composites approved
   footage/stills (assets/rex/, described by rex-assets.json) into the market world at a physical depth.

   Key modes (chosen per shot by evidence, overridable for review with ?key=luma|alpha|packed):
     luma   — footage on pure black; alpha derived from brightness (premultiplied "over black")
     alpha  — media with a real alpha channel (WebM VP9 alpha / PNG)
     packed — one ordinary video, colour in the top half and a greyscale matte in the bottom half
   Integration: depth-matched blur, fog, exposure, and the market itself reflected onto REX (a low-resolution
   render of the field sampled in screen space, strongest on highlights: eyes, cornea, rim).
   If the manifest or a shot is missing, nothing is drawn — there is no procedural fallback REX. */

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `
uniform sampler2D uMap, uEnv; uniform float uMode, uOpacity, uBlur, uExpo, uLo, uHi, uRefl, uFog, uFeather, uAspect, uLift;
uniform vec3 uBg; uniform vec2 uRes; varying vec2 vUv;
vec4 src(vec2 uv){
  if (uMode > 1.5) { vec3 c = texture2D(uMap, vec2(uv.x, 0.5 + uv.y * 0.5)).rgb; float a = texture2D(uMap, vec2(uv.x, uv.y * 0.5)).g; return vec4(c * a, a); }
  vec4 t = texture2D(uMap, uv);
  if (uMode > 0.5) return vec4(t.rgb * t.a, t.a);
  float l = max(max(t.r, t.g), t.b); float a = smoothstep(uLo, uHi, l);
  return vec4(t.rgb, a);                                     // footage over black is already premultiplied
}
void main(){
  vec4 c = src(vUv);
  if (uBlur > 0.0005) {                                      // depth-of-field: 12-tap disk, matched to the panels' blur
    vec4 acc = c; float r = uBlur;
    for (int i = 0; i < 12; i++) { float an = float(i) * 2.39996; float rr = r * sqrt((float(i) + 0.5) / 12.0);
      acc += src(vUv + vec2(cos(an) * rr / uAspect, sin(an) * rr)); }
    c = acc / 13.0;
  }
  float f = uFeather; c *= smoothstep(0.0, f, vUv.x) * smoothstep(0.0, f, 1.0 - vUv.x) * smoothstep(0.0, f, vUv.y) * smoothstep(0.0, f, 1.0 - vUv.y);
  vec3 rgb = c.rgb * uExpo + uLift * c.a;
  vec3 straight = rgb / max(c.a, 0.001);
  float lum = dot(straight, vec3(0.299, 0.587, 0.114));
  vec3 env = texture2D(uEnv, gl_FragCoord.xy / uRes).rgb;
  rgb += env * uRefl * c.a * (0.18 + 1.2 * smoothstep(0.35, 0.95, lum));   // the market, reflected on REX
  rgb = mix(rgb, uBg * c.a, uFog);
  gl_FragColor = vec4(rgb, c.a) * uOpacity;
}`;

export async function createRexLayer({ THREE, scene, renderer, bg, manifestUrl, keyOverride, rm }) {
  let manifest = null;
  try { const r = await fetch(manifestUrl, { cache: 'no-cache' }); if (r.ok) manifest = await r.json(); } catch { /* absent: no REX */ }
  const base = new URL(manifestUrl, location.href);
  const envRT = new THREE.WebGLRenderTarget(384, 216, { type: THREE.UnsignedByteType }); envRT.texture.colorSpace = THREE.SRGBColorSpace;
  const shots = {};
  const status = {};

  function makeShot(id, def) {
    const v = (keyOverride && def.variants && def.variants[keyOverride]) || def;
    const mode = v.mode || manifest.mode || 'luma';
    const url = p => new URL(p, base).href;
    let el, tex, kind;
    if (v.video && !rm) {
      el = document.createElement('video'); el.muted = true; el.playsInline = true; el.loop = !!def.loop; el.preload = 'auto'; el.crossOrigin = 'anonymous';
      for (const [type, p] of Object.entries(v.video)) { const s = document.createElement('source'); s.src = url(p); s.type = type === 'webm' ? 'video/webm' : type === 'hevc' ? 'video/mp4; codecs="hvc1"' : 'video/mp4'; el.appendChild(s); }
      tex = new THREE.VideoTexture(el); kind = 'video';
    } else if (v.image || v.poster) {
      el = new Image(); el.decoding = 'async'; el.src = url(v.image || v.poster); tex = new THREE.Texture(el); el.onload = () => { tex.needsUpdate = true; status[id].ready = true; }; kind = 'image';
    } else return null;
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const u = { uMap: { value: tex }, uEnv: { value: envRT.texture }, uMode: { value: mode === 'packed' ? 2 : mode === 'alpha' ? 1 : 0 }, uOpacity: { value: 0 }, uBlur: { value: 0 }, uExpo: { value: 1 },
      uLo: { value: v.key?.lo ?? 0.02 }, uHi: { value: v.key?.hi ?? 0.16 }, uRefl: { value: 0 }, uFog: { value: 0 }, uFeather: { value: v.feather ?? 0.06 }, uAspect: { value: def.aspect || 16 / 9 }, uLift: { value: 0 },
      uBg: { value: new THREE.Color(bg) }, uRes: { value: new THREE.Vector2(1, 1) } };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: u, transparent: true, depthWrite: false, premultipliedAlpha: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.visible = false; scene.add(mesh);
    status[id] = { id, mode, kind, src: kind === 'video' ? Object.values(v.video).join(' | ') : (v.image || v.poster), ready: false, w: 0, h: 0 };
    if (kind === 'video') el.addEventListener('loadeddata', () => { status[id].ready = true; status[id].w = el.videoWidth; status[id].h = el.videoHeight; }, { once: true });
    if (kind === 'video') el.addEventListener('error', () => { status[id].error = 'media error'; }, true);
    return { id, def, el, tex, kind, mesh, u, aspect: def.aspect || 16 / 9, anchor: def.anchor || [0.5, 0.5], hidden: 0, shown: false };
  }
  if (manifest && manifest.shots) for (const [id, def] of Object.entries(manifest.shots)) { const s = makeShot(id, def); if (s) shots[id] = s; }
  for (const id of ['R-01', 'R-02', 'R-03']) if (!status[id]) status[id] = { id, missing: true };

  let resW = 1, resH = 1, envFrame = 0, lastEye = null;
  /* list: [{ id, a, x, y, d, h, blur, expo, refl, fog, lift }] in world units (camera at origin looking −z) */
  function update(list, t, camera) {
    let anyRefl = false, best = null;
    const want = new Set(list.filter(e => e.a > 0.004 && shots[e.id]).map(e => e.id));
    for (const s of Object.values(shots)) {
      const e = list.find(q => q.id === s.id);
      if (!e || !want.has(s.id)) { s.mesh.visible = false; if (s.kind === 'video' && !s.el.paused) s.el.pause(); s.hidden += 1; continue; }
      if (s.kind === 'video') {
        if (s.hidden > 45 && !s.def.loop) { try { s.el.currentTime = 0; } catch { /* not seekable yet */ } }
        if (s.el.paused && !(s.el.ended && !s.def.loop)) s.el.play().catch(() => {});
      }
      s.hidden = 0;
      const w = e.h * s.aspect; s.mesh.scale.set(w, e.h, 1); s.mesh.position.set(e.x, e.y, -e.d); s.mesh.visible = true;
      Object.assign(s.u.uOpacity, { value: e.a }); s.u.uBlur.value = e.blur || 0; s.u.uExpo.value = e.expo ?? 1; s.u.uRefl.value = e.refl || 0; s.u.uFog.value = e.fog || 0; s.u.uLift.value = e.lift || 0; s.u.uRes.value.set(resW, resH);
      if (e.refl > 0) anyRefl = true;
      if (!best || e.a > best.a) best = { e, s, w };
    }
    lastEye = best && best.e.a > 0.15 ? new THREE.Vector3(best.e.x + (best.s.anchor[0] - 0.5) * best.w, best.e.y + (0.5 - best.s.anchor[1]) * best.e.h, -best.e.d) : null;
    if (anyRefl && (envFrame++ % 2 === 0)) {   // render the market without REX into the environment buffer
      const vis = Object.values(shots).map(s => s.mesh.visible); Object.values(shots).forEach(s => { s.mesh.visible = false; });
      renderer.setRenderTarget(envRT); renderer.render(scene, camera); renderer.setRenderTarget(null);
      Object.values(shots).forEach((s, k) => { s.mesh.visible = vis[k]; });
    }
  }
  return {
    update, resize(w, h) { resW = w; resH = h; }, eyeWorld: () => lastEye, has: id => !!shots[id], placeOf: id => shots[id]?.def.place || null,
    info: () => ({ manifest: !!manifest, pipeline: manifest?.mode || '—', keyOverride: keyOverride || null, shots: Object.values(status) })
  };
}
