import itertools, json, datetime as dt, multiprocessing as mp
import break_sim as B
DATA='/mnt/user-data/uploads/Desktop/XAUUSD_M1_202607231802_202611031222.csv'
OUT='/tmp/claude-0/-home-claude/e4123d46-e8e9-5f95-a862-bfae4c9b0110/scratchpad/opt/break2.jsonl'
PER=[('A',dt.datetime(2026,8,1),dt.datetime(2026,10,1)),('B',dt.datetime(2026,10,1),dt.datetime(2026,10,26)),('C',dt.datetime(2026,10,26),dt.datetime(2026,11,4))]
ROWS=None
def init():
    global ROWS; ROWS=B.load(DATA)
def ev(P):
    tr=B.run(ROWS,P); return dict(P=P,**{k:B.summary(tr,a,b) for k,a,b in PER})
grid=[]
for piv,entry,stop,tp,p1,hb,sf,minw in itertools.product([15,20,30],[0.5,0.5785,0.657],[0.236,0.1,0.0,-0.15],[1.5,2,3],[(0,1,0),(0.5,1,0),(0.5,1,0.1),(0.5,0.7,0)],[(),tuple(range(20,24))],[False,True],[1,3]):
    grid.append(dict(piv=piv,minw=minw,entry=entry,stop=stop,buf=0.05,tp_mode='R',tp=tp,be=0,newer=True,maxw=240,maxhold=240,p1=p1[0],p1r=p1[1],p1be=p1[2],hb=hb,stallfix=sf))
if __name__=='__main__':
    with mp.Pool(2,initializer=init) as pool, open(OUT,'w') as f:
        for r in pool.imap_unordered(ev,grid,chunksize=8): f.write(json.dumps(r)+'\n')
    print('done',len(grid))
