"""Refresh source-objective observations; failed/partial fetches retain verified evidence."""
import importlib.util,json,concurrent.futures,datetime
from pathlib import Path

def retain_evidence(current, previous, checked_at):
    if not previous or not previous.get('bars'):
        return current
    old={b['at']:b for b in previous['bars']}
    new={b['at']:b for b in current.get('bars',[])}
    if current.get('error') or not set(old).issubset(new):
        kept=dict(previous)
        kept['lastAttempt']={'at':checked_at,'status':'retained-verified-evidence','reason':current.get('error','Provider returned fewer previously verified observation intervals')}
        return kept
    return current

def main():
    sp=importlib.util.spec_from_file_location('signals','tools/charts/signals.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
    target=Path('data/market/signal-outcome-observations.json')
    previous={c['event']:c for c in json.loads(target.read_text()).get('charts',[])} if target.exists() else {}
    feed=json.loads(Path('data/content.json').read_text());items=[e for e in feed['items'] if e['language']=='en' and 'autochartist' in e.get('tags',[])]
    checked_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
    def get(e):
        try:
            c=m.fetch_chart(e);start=e['freshness']['dataAsOf'];end=e['freshness']['validUntil'];c['bars']=[b for b in c['bars'] if start<=b['at']<end];c.pop('excludedBars',None)
        except Exception as exc:
            c={'event':e['slug'],'bars':[],'error':type(exc).__name__}
        return retain_evidence(c,previous.get(e['slug']),checked_at)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:charts=list(pool.map(get,items))
    temporary=target.with_suffix('.tmp.json')
    temporary.write_text(json.dumps({'checkedAt':checked_at,'charts':charts},indent=2)+'\n');temporary.replace(target)
    print([(c['event'],len(c['bars']),c.get('error'),c.get('lastAttempt',{}).get('status')) for c in charts])

if __name__=='__main__':main()
