import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {preparePackage} from '../../tools/editorial/publish.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
test('education-only import retains real calendar verification and all prior publications on retry',()=>{
 const input=read('content-ops/daily/2026-11-03/forex-foundations.json'),feed=read('data/content.json'),before=JSON.stringify(input.calendar);
 const out=preparePackage(input,feed,{now:'2026-11-02T23:00:00.000Z'});
 assert.equal(JSON.stringify(out.calendar),before);assert.equal(out.feed.items.length,feed.items.length);assert.equal(out.receipt.records.length,0);
});
test('education exception cannot publish news under an old calendar check',()=>{
 const input=read('content-ops/daily/2026-11-03/forex-foundations.json');input.records[0].type='NEWS';
 assert.throws(()=>preparePackage(input,read('data/content.json'),{now:'2026-11-02T23:00:00.000Z'}),/REX_EXPLAINS only/);
});
