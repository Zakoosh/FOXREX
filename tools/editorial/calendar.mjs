import { createRequire } from 'node:module';
import { esc, enText, arText } from '../site/text.mjs';
const require = createRequire(import.meta.url);
const TIME = require('../../scripts/content/time.js');
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const instant = s => typeof s === 'string' && ISO.test(s) && Number.isFinite(Date.parse(s));
const https = s => typeof s === 'string' && /^https:\/\/[^\s<>"']+$/.test(s);
export function validateCalendar(c, now = Date.now()) {
  const errors = [];
  if (!c || c.schemaVersion !== 1 || !Array.isArray(c.events)) return ['Invalid calendar shape'];
  if (!instant(c.updatedAt) || Date.parse(c.updatedAt) > now + 60000) errors.push('Invalid calendar timestamp');
  if (c.timezone !== 'Europe/Istanbul') errors.push('Calendar timezone must be Europe/Istanbul');
  if (!c.coverage?.en || !c.coverage?.ar) errors.push('Bilingual coverage note required');
  const ids = new Set();
  for (const e of c.events) {
    if (!/^[a-z0-9-]+$/.test(e.id) || ids.has(e.id)) errors.push('Duplicate/invalid event ID');
    ids.add(e.id);
    if (!instant(e.at)) errors.push(`${e.id}: invalid event timestamp`);
    if (!e.title?.en || !e.title?.ar) errors.push(`${e.id}: bilingual title required`);
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(e.impact)) errors.push(`${e.id}: invalid impact`);
    if (!/^[A-Z]{3}$/.test(e.currency) || !e.country?.en || !e.country?.ar) errors.push(`${e.id}: country/currency required`);
    if (!['scheduled', 'released', 'postponed', 'cancelled'].includes(e.status)) errors.push(`${e.id}: invalid status`);
    if (!https(e.source?.url) || !e.source?.name || !instant(e.source?.checkedAt) || Date.parse(e.source.checkedAt) > now + 60000) errors.push(`${e.id}: source and verification time required`);
    if (e.source?.timeUrl && !https(e.source.timeUrl)) errors.push(`${e.id}: invalid timing source`);
    for (const key of ['previous', 'forecast', 'actual']) {
      const value = e[key];
      if (value != null && (typeof value !== 'object' || !String(value.value ?? '').trim() || !https(value.sourceUrl))) errors.push(`${e.id}: ${key} requires value and sourceUrl`);
    }
    if (e.actual != null && (e.status !== 'released' || Date.parse(e.at) > now)) errors.push(`${e.id}: premature actual`);
  }
  return errors;
}

export function calendarBody(c, lang) {
  const ar = lang === 'ar', L = s => ar ? arText(s) : enText(s), T = (en, arabic) => L(ar ? arabic : en);
  const val = x => x == null ? '—' : `<a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener noreferrer">${L(x.value)}</a>`;
  const impact = { HIGH: ['High', 'مرتفع'], MEDIUM: ['Medium', 'متوسط'], LOW: ['Low', 'منخفض'] };
  const status = { scheduled: ['Scheduled', 'مجدول'], released: ['Released', 'صدر'], postponed: ['Postponed', 'مؤجل'], cancelled: ['Cancelled', 'ملغى'] };
  const rows = [...c.events].sort((a,b) => a.at.localeCompare(b.at)).map(e => `<tr data-event-date="${TIME.editorialDate(e.at)}" data-event-currency="${esc(e.currency)}"><td><time datetime="${e.at}">${esc(TIME.editorialDate(e.at))}<br>${TIME.istTime(e.at)}</time></td><td>${L(e.country[lang])}<br><bdi dir="ltr">${e.currency}</bdi></td><td>${L(e.title[lang])}<br><small>${T(...status[e.status])}</small></td><td>${T(...impact[e.impact])}</td><td>${val(e.previous)}</td><td>${val(e.forecast)}</td><td>${val(e.actual)}</td><td><a href="${esc(e.source.url)}" target="_blank" rel="noopener noreferrer">${L(e.source.name)}</a>${e.source.timeUrl ? ` · <a href="${esc(e.source.timeUrl)}" target="_blank" rel="noopener noreferrer">${T('Release time', 'موعد الإصدار')}</a>` : ''}<br><small>${T('Verified', 'تم التحقق')} ${esc(TIME.formatIst(e.source.checkedAt))}</small></td></tr>`).join('\n');
  return `<section class="page-hero"><div class="wrap"><p class="eyebrow">${T('Economic calendar', 'التقويم الاقتصادي')}</p><h1>${T('The events that matter', 'الأحداث التي تحرّك السوق')}</h1><p>${T('All times are Europe/Istanbul. Dates are verified against official sources; impact ratings are FOXREX editorial judgments.', 'كل المواعيد بتوقيت إسطنبول. التواريخ موثقة من المصادر الرسمية؛ تصنيف التأثير تقدير تحريري من FOXREX.')}</p></div></section>
<section class="section section--tight"><div class="wrap">
<p>${L(c.coverage[lang])}</p><p class="fx-card__meta">${T('Last verified', 'آخر تحقق')}: <time datetime="${c.updatedAt}">${esc(TIME.formatIst(c.updatedAt))}</time> · Europe/Istanbul</p>
<p class="fx-notice" data-calendar-stale hidden>${T('This calendar has not been refreshed for over 36 hours. Recheck the official source before relying on a release time.', 'لم يتم تحديث التقويم منذ أكثر من 36 ساعة. راجع المصدر الرسمي قبل الاعتماد على موعد الخبر.')}</p>
<div class="calendar-filters"><label>${T('Period', 'الفترة')} <select data-calendar-period><option value="week">${T('Next 7 days', 'الأيام السبعة القادمة')}</option><option value="today">${T('Today', 'اليوم')}</option><option value="all">${T('All listed events', 'كل الأحداث المسجلة')}</option></select></label><label>${T('Currency', 'العملة')} <select data-calendar-currency><option value="all">${T('All', 'الكل')}</option>${[...new Set(c.events.map(e => e.currency))].sort().map(x => `<option>${x}</option>`).join('')}</select></label></div>
<p data-calendar-empty hidden>${T('No verified events are listed for this filter. This does not mean no events are scheduled globally.', 'لا توجد أحداث موثقة ضمن الفلتر الحالي. هذا لا يعني عدم وجود أخبار أخرى عالميًا.')}</p>
<div class="calendar-scroll" role="region" aria-label="${ar ? 'جدول الأخبار الاقتصادية' : 'Economic releases'}" tabindex="0" data-calendar-updated="${c.updatedAt}"><table class="calendar-table"><thead><tr>${[['Istanbul time','توقيت إسطنبول'],['Country / currency','الدولة / العملة'],['Event','الحدث'],['Impact','التأثير'],['Previous','السابق'],['Consensus','المتوقع'],['Actual','الفعلي'],['Official source','المصدر الرسمي']].map(x => `<th scope="col">${T(...x)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="fx-card__meta">${T('A dash means no verified value is available. Scheduled times may change; this is an editorial calendar, not a live economic-data service.', 'الشرطة تعني عدم توفر قيمة موثقة. المواعيد قابلة للتعديل؛ هذا تقويم تحريري وليس خدمة نتائج لحظية.')}</p></div></section>`;
}
