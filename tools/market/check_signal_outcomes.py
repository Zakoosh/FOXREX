import importlib.util,json,concurrent.futures,datetime
from pathlib import Path
sp=importlib.util.spec_from_file_location('signals','tools/charts/signals.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
feed=json.loads(Path('data/content.json').read_text());items=[e for e in feed['items'] if e['language']=='en' and 'autochartist'in e.get('tags',[])]
def get(e):
 try:
  c=m.fetch_chart(e);start=e['freshness']['dataAsOf'];end=e['freshness']['validUntil'];c['bars']=[b for b in c['bars'] if start<=b['at']<end];c.pop('excludedBars',None);return c
 except Exception as exc:return {'event':e['slug'],'bars':[],'error':type(exc).__name__}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:charts=list(pool.map(get,items))
Path('data/market/signal-outcome-observations.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'charts':charts},indent=2)+'\n')
print([(c['event'],len(c['bars']),c.get('error')) for c in charts])
