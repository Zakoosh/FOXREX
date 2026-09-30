/* Text helpers for the FOXREX site generator.
   Arabic rule: every Latin / numeric run inside Arabic (market symbols, prices, percentages,
   times, brand names such as FOXREX or Telegram) is isolated in <bdi class="lt"> so it renders
   in Inter, left-to-right, and cannot reorder the surrounding Arabic sentence. */

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const breaks = (s, fn) => String(s ?? '').split('\n').map(fn).join('<br>');

/** English text: escaped, "\n" becomes a line break. */
export const enText = s => breaks(s, esc);

// A run starts with a Latin letter, digit, sign or currency and may continue across spaces
// to further Latin words (e.g. "US Dollar", "REX EXPLAINS", "+0.42%", "4,328.50", "15:30").
const RUN = /[A-Za-z0-9$€£+−][A-Za-z0-9.,:%/+&'’_−-]*(?:[  ][A-Za-z0-9$€£+−][A-Za-z0-9.,:%/+&'’_−-]*)*/g;
const TRAIL = /[.,:/&'’_-]+$/;

/** Arabic text: escaped, Latin/number runs isolated, "\n" becomes a line break. */
export function arText(s) {
  return breaks(s, line => {
    let out = '', last = 0;
    for (const m of line.matchAll(RUN)) {
      let run = m[0];
      const trail = (run.match(TRAIL) || [''])[0];
      run = run.slice(0, run.length - trail.length);
      out += esc(line.slice(last, m.index));
      out += run ? `<bdi class="lt" dir="ltr">${esc(run)}</bdi>` : '';
      out += esc(trail);
      last = m.index + m[0].length;
    }
    return out + esc(line.slice(last));
  });
}
