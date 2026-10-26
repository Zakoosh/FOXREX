import test from 'node:test';import assert from 'node:assert/strict';
import {orderedNews,signalSummary} from '../../tools/site/desk-summary.mjs';
test('future calendar previews cannot outrank the latest occurred news',()=>{const a={publishedAt:'2026-10-26T06:00:00Z'},b={publishedAt:'2026-10-25T00:00:00Z',eventTime:'2026-10-30T00:00:00Z'};assert.equal(orderedNews([b,a],Date.parse('2026-10-26T12:00:00Z'))[0],a);});
test('objective observations never manufacture trade returns or negative results across missing bars',()=>{const e={slug:'x',keyLevels:['low: 1','high: 2'],bias:'bullish',timeframe:'H1',freshness:{dataAsOf:'2026-10-26T00:00:00Z',validUntil:'2026-10-26T02:00:00Z'}};
assert.equal(signalSummary(e,[]).result,'unverifiable');
const result=signalSummary(e,[{event:'x',bars:[{at:'2026-10-26T00:00:00Z',high:3,low:1}]}]);assert.equal(result.result,'objective-touched');assert.equal(result.sl,null);assert.equal(result.tradeResult,'missing-trade-rules');
assert.equal(signalSummary(e,[{event:'x',bars:[{at:'2026-10-26T00:00:00Z',high:1.5,low:1}]}]).result,'unverifiable');});
test('a bar entirely beyond the objective does not prove an observed touch',()=>{
 const e={slug:'x',keyLevels:['low: 1','high: 2'],bias:'bullish',timeframe:'H1',freshness:{dataAsOf:'2026-10-26T00:00:00Z',validUntil:'2026-10-26T02:00:00Z'}};
 assert.equal(signalSummary(e,[{event:'x',bars:[{at:'2026-10-26T00:00:00Z',high:4,low:3}]}]).result,'unverifiable');
});
test('news order follows exact publication time, independent of source-date tags',()=>{const old={publishedAt:'2026-10-26T07:00:00Z',tags:['source-date-2026-10-26']},recent={publishedAt:'2026-10-26T14:00:00Z',tags:['source-date-2026-10-23']};assert.equal(orderedNews([old,recent])[0],recent);});
