/* Capability table for the official Higgsfield CLI (source: github.com/higgsfield-ai/cli MODELS.md, CLI v1.1.26).
   Routing is capability-based: first configured model that supports the aspect ratio and reference count wins. */
export const MODELS = Object.freeze({
  nano_banana_2: { id: "nano_banana_2", name: "Nano Banana Pro", type: "image", maxRefs: 14,
    aspects: ["1:1","3:2","2:3","4:3","3:4","4:5","5:4","9:16","16:9","21:9"], params: { resolution: "2k" } },
  gpt_image_2_5: { id: "gpt_image_2_5", name: "GPT Image 2.5", type: "image", maxRefs: 16,
    aspects: ["1:1","3:2","2:3","4:3","3:4","16:9","9:16","21:9","4:5","5:4"], params: { quality: "high", resolution: "2k" } },
  seedream_v5_lite: { id: "seedream_v5_lite", name: "Seedream V5 Lite", type: "image", maxRefs: 8,
    aspects: ["1:1","4:3","3:4","16:9","9:16"], params: {} },
  kling3_0: { id: "kling3_0", name: "Kling v3.0", type: "video", maxRefs: 1, startImage: true,
    aspects: ["16:9","9:16","1:1"], params: { duration: "5", mode: "std", sound: "off" } }
});

export function chooseModel({ type, aspectRatio, refs = 0, preferred = [] }) {
  const pool = preferred.map(id => MODELS[id]).filter(Boolean).concat(Object.values(MODELS));
  return pool.find(m => m.type === type && m.aspects.includes(aspectRatio) && m.maxRefs >= refs) || null;
}
