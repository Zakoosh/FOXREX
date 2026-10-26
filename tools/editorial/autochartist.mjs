#!/usr/bin/env node
/* Extracted, source-verified facts + original trilingual copy; never imports raw email HTML. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preparePackage} from './publish.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,24);
export function prepareAutochartist(input,feed,operations,{now=new Date().toISOString(),root=ROOT}={}){
 if(input.authorization!=='owner-autochartist-2026-10-26')throw Error('Missing Autochartist mandate');
 if(!['alerts@autochartist.email','alerts@autochartist.com'].includes(input.sender))throw Error('Sender not allowed');
 if(!input.authenticatedSender)throw Error('Verify original sender authentication from full MIME');
 if(input.sourcePublishedAt&&(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(input.sourcePublishedAt)||!Number.isFinite(Date.parse(input.sourcePublishedAt))||Date.parse(input.sourcePublishedAt)>Date.parse(now)))throw Error('Invalid source report publication time');
 if(!Array.isArray(input.alerts)||!input.alerts.length)throw Error('No alerts');
 const processed=new Set(operations.processedEvents||[]),records=[],events=[];
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(now));
 for(const a of input.alerts){
  for(const k of ['detectedAt','validUntil'])if(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(a[k]||'')||!Number.isFinite(Date.parse(a[k])))throw Error('Exact source detection/expiry UTC required');
  if(Date.parse(a.detectedAt)>Date.parse(now)||Date.parse(a.validUntil)<=Date.parse(now)||Date.parse(a.detectedAt)<Date.parse(now)-48*3600000)throw Error('Stale or premature alert');
  if(!a.symbol||!a.pattern||!a.timeframe||!a.sourceTimezone||!a.sourceEvidence)throw Error('Missing exact source facts');
  const id='ac-'+hash([a.symbol,a.pattern,a.detectedAt,a.timeframe,a.direction||'neutral'].join('|'));
  if(processed.has(id)||feed.items.some(x=>x.slug===id))continue;
  if(!a.records||a.records.length!==3||new Set(a.records.map(r=>r.language)).size!==3||!['en','ar','tr'].every(l=>a.records.some(r=>r.language===l)))throw Error('EN/AR/TR required');
  for(const r of a.records){
   if(/mail\.google|unsubscribe|uhash=|user=|@gmail|<html|<script/i.test(JSON.stringify(r)))throw Error('Raw mail or private metadata must not be published');
   records.push({...r,type:'ANALYSIS',slug:id,symbol:a.symbol,category:'technical',tags:[...new Set([...(r.tags||[]),'autochartist'])],sourceReferences:[{name:'Autochartist',url:'https://autochartist.com/',sourceType:'market-data-provider',publisher:'Autochartist',publishedAt:input.sourcePublishedAt||a.detectedAt,retrievedAt:now}],fields:{...(r.fields||{}),timeframe:a.timeframe,dataAsOf:a.detectedAt,validUntil:a.validUntil}});
  }
  events.push(id);
 }
 if(!records.length)return {feed,calendar:input.calendar,operations,receipt:{records:[],events:[]}};
 const result=preparePackage({authorization:'owner-authorized-2026-10-25',date,records,calendar:input.calendar},feed,{now,root});
 return {...result,operations:{...operations,checkedAt:now,autochartist:{status:'published',message:'نُشرت أحدث التحليلات الموثقة من Autochartist.'},processedEvents:[...processed,...events]},receipt:{...result.receipt,events}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const file=process.argv.slice(2).find(x=>!x.startsWith('--'));if(!file)throw Error('Usage: autochartist.mjs package.json [--apply]');
 const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
 const r=prepareAutochartist(JSON.parse(fs.readFileSync(file,'utf8')),read('data/content.json'),read('data/operations.json'));
 if(process.argv.includes('--apply')&&r.receipt.events.length){for(const [p,v]of [['data/content.json',r.feed],['data/calendar.json',r.calendar],['data/operations.json',r.operations]])fs.writeFileSync(path.join(ROOT,p),JSON.stringify(v,null,2)+'\n');}
 console.log(JSON.stringify(r.receipt,null,2));
}
