#!/usr/bin/env node
/* Verified release result + three-language analysis update, prepared before any files are written.
   Commit feed, calendar and generated pages atomically after checks. No result guessing. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFeed } from '../site/check-feed.mjs';
import { enrich } from './enrich.mjs';
import { validateCalendar } from './calendar.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export function prepareResults(calendar,feed,input,now=new Date().toISOString()){
 if(input.authorization!=='owner-authorized-release-results-2026-10-26')throw Error('Missing result publication mandate');
 const c=structuredClone(calendar),updates=input.articleUpdates||[];
 if(!input.results?.length)throw Error('No results');
 for(const r of input.results){
  const e=c.events.find(e=>e.id===r.eventId);if(!e)throw Error('Unknown event');
  if(Date.parse(e.at)>Date.parse(now))throw Error('Result before scheduled release');
  if(!r.actual?.value||!r.actual?.sourceUrl||!r.translationGroupId)throw Error('Result source and analysis required');
  let u;try{u=new URL(r.actual.sourceUrl)}catch{throw Error('Invalid result source')}
  const host=x=>new URL(x).hostname.replace(/^www\./,'');
  if(u.protocol!=='https:'||host(r.actual.sourceUrl)!==host(e.source.url))throw Error('Result must come from the official releasing agency');
  const group=feed.items.filter(x=>x.translationGroupId===r.translationGroupId);
  if(!['en','ar','tr'].every(l=>group.some(e=>e.language===l&&updates.some(p=>p.id===e.id&&p.body&&p.summary))))throw Error('Result requires updated EN/AR/TR analysis');
  e.actual=r.actual;e.status='released';e.analysisPath=group.find(e=>e.language==='en').urlPath;e.source.checkedAt=now;
 }
 c.updatedAt=now;const errors=validateCalendar(c,Date.parse(now));if(errors.length)throw Error(errors.join('\n'));
 const f=enrich(feed,{authorization:'owner-requested-presentation-2026-10-26',updates},now);
 for(const r of input.results)for(const e of f.items.filter(e=>e.translationGroupId===r.translationGroupId)){
  e.sources=[...(e.sources||[]).filter(s=>s.url!==r.actual.sourceUrl),{name:c.events.find(e=>e.id===r.eventId).source.name+' — release result',url:r.actual.sourceUrl,retrievedAt:now,sourceType:'official'}];
 }
 const fe=checkFeed(f);if(fe.length)throw Error(fe.join('\n'));
 return {calendar:c,feed:f};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const file=process.argv.slice(2).find(x=>!x.startsWith('--'));if(!file)throw Error('Usage: results.mjs results.json [--apply]');
 const r=prepareResults(JSON.parse(fs.readFileSync(ROOT+'data/calendar.json','utf8')),JSON.parse(fs.readFileSync(ROOT+'data/content.json','utf8')),JSON.parse(fs.readFileSync(file,'utf8')));
 if(process.argv.includes('--apply')){fs.writeFileSync(ROOT+'data/calendar.json',JSON.stringify(r.calendar,null,2)+'\n');fs.writeFileSync(ROOT+'data/content.json',JSON.stringify(r.feed,null,2)+'\n');}
 console.log(JSON.stringify({applied:process.argv.includes('--apply'),results:r.calendar.events.filter(e=>e.status==='released').length}));
}
