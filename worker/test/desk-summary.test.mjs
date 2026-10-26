import test from 'node:test';import assert from 'node:assert/strict';
import {tickerTimestamp,orderedNews,signalSummary} from '../../tools/site/desk-summary.mjs';
test('future calendar previews cannot outrank the latest occurred news',()=>{const a={publishedAt:'2026-10-26T06:00:00Z'},b={publishedAt:'2026-10-25T00:00:00Z',eventTime:'2026-10-30T00:00:00Z'};assert.equal(orderedNews([b,a],Date.parse('2026-10-26T12:00:00Z'))[0],a);});
test('objective observations never manufacture trade returns or negative results across missing bars',()=>{const e={slug:'x',keyLevels:['low: 1','high: 2'],bias:'bullish',timeframe:'H1',freshness:{dataAsOf:'2026-10-26T00:00:00Z',validUntil:'2026-10-26T02:00:00Z'}};
assert.equal(signalSummary(e,[]).result,'unverifiable');
const result=signalSummary(e,[{event:'x',bars:[{at:'2026-10-26T00:00:00Z',high:3,low:1}]}]);assert.equal(result.result,'objective-touched');assert.equal(result.sl,null);assert.equal(result.tradeResult,'missing-trade-rules');
assert.equal(signalSummary(e,[{event:'x',bars:[{at:'2026-10-26T00:00:00Z',high:1.5,low:1}]}]).result,'unverifiable');});
test('a bar entirely beyond the objective does not prove an observed touch',()=>{
 const e={slug:'x',keyLevels:['low: 1','high: 2'],bias:'bullish',timeframe:'H1',freshness:{dataAsOf:'2026-10-26T00:00:00Z',validUntil:'2026-10-26T02:00:00Z'}};
 assert.equal(signalSummary(e,[{event:'x',bars:[{at:'2026-10-26T00:00:00Z',high:4,low:3}]}]).result,'unverifiable');
});
test('news order uses verified release chronology, then exact writing time within the same release date',()=>{const old={publishedAt:'2026-10-26T15:00:00Z',tags:['source-date-2026-09-17']},recent={publishedAt:'2026-10-25T14:00:00Z',tags:['source-date-2026-10-21']};assert.equal(orderedNews([old,recent])[0],recent);const a={publishedAt:'2026-10-26T07:00:00Z',tags:['source-date-2026-10-26']},b={publishedAt:'2026-10-26T14:00:00Z',tags:['source-date-2026-10-26']};assert.equal(orderedNews([a,b])[0],b);const c={...a,sources:[{publishedAt:'2026-10-26T16:00:00Z'}]};assert.equal(orderedNews([b,c])[0],c);});

test('Arabic ticker keeps the Istanbul calendar rollover and ASCII clock separate',()=>{const stamp=tickerTimestamp('2026-10-25T23:00:00Z');assert.deepEqual(stamp,{date:'2026-10-26',time:'02:00'});assert.ok(!/[\u061c\u200e\u200f]/.test(stamp.date+stamp.time));assert.deepEqual(tickerTimestamp('2026-10-26T21:05:00Z'),{date:'2026-10-27',time:'00:05'});});
