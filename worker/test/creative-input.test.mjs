import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('plain creative input survives a rerender before blur and invalidates unsubmitted approval', () => {
  const listeners = {}; const it = { id: 'draft', status: 'DRAFT' }; let saved = 0;
  const context = { DB: {schemaVersion:5,items:[it],settings:{}}, LS:'studio', S:{}, cur:()=>it, save:()=>saved++, newItem(){}, genPanel(){}, ingest(){}, VIEWS:{item(){}}, ACT:{}, document:{addEventListener:(name,fn)=>listeners[name]=fn} };
  vm.createContext(context); vm.runInContext(fs.readFileSync(new URL('../../creative-studio.js',import.meta.url),'utf8')+';installCreativeStudio();creativeState(DB.items[0]);',context);
  it.creative.pendingQuote = {id:'not-submitted'};it.creative.factsReviewed=true;
  listeners.input({target:{id:'creative-audience',dataset:{creative:'audience'},tagName:'INPUT',value:'Beginner traders'}});
  assert.equal(it.creative.audience,'Beginner traders'); assert.equal(it.creative.factsReviewed,false);assert.equal(it.creative.pendingQuote,undefined);assert.ok(saved>0);
  it.creative.pendingQuote={id:'uncertain',submissionAttempted:true};
  listeners.input({target:{id:'creative-tone',dataset:{creative:'tone'},tagName:'INPUT',value:'Calm'}});
  assert.equal(it.creative.pendingQuote.id,'uncertain');
  assert.match(vm.runInContext("creativeReviewWarnings({plan:{prompt:'handwritten notes'}})",context),/editable overlays/);
});

test('a text field change rerenders only after focus moves, and returns focus to the clicked field', () => {
  const html = fs.readFileSync(new URL('../../foxrex-studio.html', import.meta.url), 'utf8');
  const helper = html.slice(html.indexOf('const fieldKey='), html.indexOf('\n', html.indexOf('function renderAfterBlur(')));
  const field = (attrs) => ({ attrs, getAttribute: k => attrs[k] ?? null, selectionStart: 3, selectionEnd: 3, focus() { doc.activeElement = this; }, setSelectionRange(s, e) { this.sel = [s, e]; } });
  let clicked = field({ 'data-creative': 'tone' }), rerendered = null, timers = [], renders = 0;
  const doc = { activeElement: clicked, querySelector: sel => sel === '#main [data-creative="tone"]' ? rerendered : null };
  const ctx = { document: doc, CSS: { escape: v => v }, setTimeout: fn => timers.push(fn), render: () => { renders++; rerendered = field({ 'data-creative': 'tone' }); doc.activeElement = { getAttribute: () => null }; } };
  vm.createContext(ctx); vm.runInContext(helper, ctx);
  vm.runInContext('renderAfterBlur()', ctx);
  assert.equal(renders, 0, 'render must wait until the blur has finished moving focus');
  timers.shift()();
  assert.equal(renders, 1); assert.equal(doc.activeElement, rerendered); assert.deepEqual(rerendered.sel, [3, 3]);
});

test('creative text changes defer the rerender; concept selection rerenders immediately', () => {
  const listeners = {}; const it = { id: 'draft', status: 'DRAFT' }; const calls = [];
  const context = { DB: {schemaVersion:5,items:[it],settings:{}}, LS:'studio', S:{}, cur:()=>it, save(){}, uid:()=>'r', newItem(){}, genPanel(){}, ingest(){}, VIEWS:{item(){}}, ACT:{}, OBJECTIVES:{}, render:()=>calls.push('render'), renderAfterBlur:()=>calls.push('deferred'), document:{addEventListener:(name,fn)=>listeners[name]=fn} };
  vm.createContext(context); vm.runInContext(fs.readFileSync(new URL('../../creative-studio.js',import.meta.url),'utf8')+';installCreativeStudio();creativeState(DB.items[0]);',context);
  context.creativeBrief = () => ({});
  listeners.change({target:{dataset:{creative:'audience'},tagName:'INPUT',value:'Traders',hasAttribute:()=>false}});
  listeners.change({target:{dataset:{p:'brief.key'},tagName:'INPUT',value:'Key',hasAttribute:()=>false}});
  listeners.change({target:{dataset:{creative:'selectedId'},tagName:'SELECT',value:'concept-2',hasAttribute:()=>false}});
  assert.deepEqual(calls, ['deferred', 'deferred', 'render']);
  assert.equal(it.creative.audience, 'Traders'); assert.equal(it.creative.selectedId, 'concept-2');
});
