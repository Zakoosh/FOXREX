#!/usr/bin/env node
/* Explicit owner-requested translations/presentation updates to existing publications.
   Keeps permanent URLs, first publication and source evidence. No market facts are generated. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkFeed } from '../site/check-feed.mjs';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url), CMS=require('../../studio/cms-model.js');
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export function enrich(feed,input,now=new Date().toISOString()) {
  const out=structuredClone(feed);
  if(input.authorization!=='owner-requested-presentation-2026-10-26')throw Error('Missing owner authorization');
  const allowed=['title','summary','body','image','riskDisclosure'];
  for(const patch of input.updates || []) {
    const e=out.items.find(x=>x.id===patch.id);if(!e)throw Error('Publication not found');
    let changed=false;
    for(const [key,value] of Object.entries(patch)) {if(key==='id')continue;if(!allowed.includes(key))throw Error('Immutable or unsupported field');if(JSON.stringify(e[key])!==JSON.stringify(value)){e[key]=value;changed=true;}}
    if(changed){e.publishVersion++;e.updatedAt=now;}
  }
  for(const translation of input.translations || []) {
    const source=out.items.find(x=>x.id===translation.sourceId);if(!source)throw Error('Translation source missing');
    if(!CMS.LANGS.includes(translation.language)||translation.language===source.language)throw Error('Invalid translation language');
    const id=CMS.makeId(source.translationGroupId,translation.language),old=out.items.find(x=>x.id===id);
    const e={...structuredClone(source),id,language:translation.language,publishedAt:old?.publishedAt || now,updatedAt:now,publishVersion:(old?.publishVersion || 0)+1};
    for(const [key,value] of Object.entries(translation)){if(['sourceId','language'].includes(key))continue;if(!allowed.includes(key))throw Error('Unsupported translation field');e[key]=value;}
    e.riskDisclosure=CMS.DEFAULT_RISK[translation.language];
    const stable=x=>JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k])=>!['updatedAt','publishVersion'].includes(k))));
    if(old&&stable(old)===stable(e))continue;
    out.items=out.items.filter(x=>x.id!==id).concat(e);
  }
  if(JSON.stringify(out.items)!==JSON.stringify(feed.items)) {
    out.updated=now;out.publication={id:'pub_'+createHash('sha256').update(now).digest('hex').slice(0,24),at:now,contentId:'presentation-and-tr',action:'publish'};
  }
  const errors=checkFeed(out);if(errors.length)throw Error(errors.join('\n'));
  return out;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const file=process.argv.slice(2).find(x=>!x.startsWith('--'));if(!file)throw Error('Usage: enrich.mjs update.json [--apply]');
 const before=JSON.parse(fs.readFileSync(ROOT+'data/content.json','utf8'));
 const after=enrich(before,JSON.parse(fs.readFileSync(file,'utf8')));
 if(process.argv.includes('--apply'))fs.writeFileSync(ROOT+'data/content.json',JSON.stringify(after,null,2)+'\n');
 console.log(JSON.stringify({applied:process.argv.includes('--apply'),items:after.items.length,changed:JSON.stringify(after)!==JSON.stringify(before)}));
}
