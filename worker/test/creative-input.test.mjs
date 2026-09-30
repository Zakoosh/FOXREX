import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('plain creative input survives a rerender before blur and invalidates unsubmitted approval', () => {
  const listeners = {}; const it = { id: 'draft', status: 'DRAFT' }; let saved = 0;
  const context = { DB: {schemaVersion:5,items:[it],settings:{}}, LS:'studio', S:{}, cur:()=>it, save:()=>saved++, newItem(){}, genPanel(){}, ingest(){}, VIEWS:{item(){}}, ACT:{}, document:{addEventListener:(name,fn)=>listeners[name]=fn} };
  vm.createContext(context); vm.runInContext(fs.readFileSync(new URL('../../studio/creative-studio.js',import.meta.url),'utf8')+';installCreativeStudio();creativeState(DB.items[0]);',context);
  it.creative.pendingQuote = {id:'not-submitted'};it.creative.factsReviewed=true;
  listeners.input({target:{id:'creative-audience',dataset:{creative:'audience'},tagName:'INPUT',value:'Beginner traders'}});
  assert.equal(it.creative.audience,'Beginner traders'); assert.equal(it.creative.factsReviewed,false);assert.equal(it.creative.pendingQuote,undefined);assert.ok(saved>0);
  it.creative.pendingQuote={id:'uncertain',submissionAttempted:true};
  listeners.input({target:{id:'creative-tone',dataset:{creative:'tone'},tagName:'INPUT',value:'Calm'}});
  assert.equal(it.creative.pendingQuote.id,'uncertain');
  assert.match(vm.runInContext("creativeReviewWarnings({plan:{prompt:'handwritten notes'}})",context),/editable overlays/);
});
