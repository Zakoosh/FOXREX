import fs from 'node:fs';
export const TR = JSON.parse(fs.readFileSync(new URL('../../data/locales/tr.json',import.meta.url),'utf8'));
export function tr(s) {
  if (s == null) return '';
  const x=String(s); if (TR[x]) return TR[x];
  if (/^Archive · \d{4}-\d{2}$/.test(x)) return x.replace('Archive','Arşiv');
  if (/^Everything FOXREX published in /.test(x)) return x.replace(/^Everything FOXREX published in (.+)\.$/,'$1 döneminde yayımlanan tüm FOXREX içerikleri.');
  if (/^\d+ item\(s\)$/.test(x)) return x.replace('item(s)','içerik');
  return x;
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
// Native generated Turkish pages: translate source text/metadata, never URLs or script code.
export function turkishHtml(html) {
  return html.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>)/gi).map(part=>{
    if (!part.startsWith('<')) {const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(part);return m[1]+esc(tr(decode(m[2])))+m[3];}
    if (/^<(script|style)\b/i.test(part)) return part;
    return part.replace(/\b(alt|aria-label|title|placeholder|content)="([^"]*)"/g,(all,k,v)=>`${k}="${esc(tr(decode(v)))}"`);
  }).join('');
}
