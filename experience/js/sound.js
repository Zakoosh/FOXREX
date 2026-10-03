/* Optional sound architecture. Silent by default; nothing plays until the visitor explicitly turns it on.
   Cues are synthesised (no audio files): low data ambience, soft scan tick, decision tone, risk cue, REX presence. */
let ctx = null, on = false, amb = null;
function tone(freq, dur = 0.35, gain = 0.03, type = 'sine') {
  if (!on || !ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
}
export const Sound = {
  toggle() {
    on = !on;
    if (on && !ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { on = false; return false; } ctx = new AC(); }
    if (on) { ctx.resume(); if (!amb) { amb = ctx.createOscillator(); const g = ctx.createGain(); amb.type = 'sine'; amb.frequency.value = 55; g.gain.value = 0.012; amb.connect(g).connect(ctx.destination); amb.start(); amb._g = g; } else amb._g.gain.value = 0.012; }
    else if (amb) amb._g.gain.value = 0;
    return on;
  },
  cue(kind) { ({ tick: () => tone(880, 0.08, 0.008, 'triangle'), rex: () => tone(330, 0.6, 0.02), risk: () => tone(146, 0.5, 0.03, 'triangle'), pass: () => tone(392, 0.4, 0.02), decision: () => { tone(220, 1.2, 0.03); tone(330, 1.2, 0.015); } })[kind]?.(); },
  scene(id) { if (id === 'reason' || id === 'ask') this.cue('rex'); }
};
