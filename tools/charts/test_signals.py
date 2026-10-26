import io,json,unittest
from unittest.mock import patch
from tools.charts import signals

class SignalChartIntegrity(unittest.TestCase):
 def item(self,tf='M30'):
  return dict(symbol='NZDJPY',timeframe=tf,slug='ac-test',bias='bearish',keyLevels=['Lower: 89.2940','Upper: 89.6880'],freshness=dict(dataAsOf='2026-10-26T06:30:00Z',validUntil='2026-10-26T15:30:00Z'))
 def response(self,granularity='30m',currency='JPY'):
  times=[1792706400+i*1800 for i in range(16)]
  q={k:[v]*16 for k,v in dict(open=89.4,high=89.6,low=89.3,close=89.5).items()}
  return dict(chart=dict(result=[dict(meta=dict(symbol='NZDJPY=X',currency=currency,dataGranularity=granularity),timestamp=times,indicators=dict(quote=[q]))]))
 def fetch(self,response,item=None):
  with patch.object(signals.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(response).encode())):
   return signals.fetch_chart(item or self.item())
 def test_half_hour_identity_and_exact_levels(self):
  c=self.fetch(self.response())
  self.assertEqual(c['timeframe'],'M30');self.assertIn('interval=30m',c['sourceUrl'])
  self.assertEqual(c['levels'],dict(lower=89.2940,upper=89.6880));self.assertEqual(c['direction'],'bearish')
 def test_wrong_timeframe_and_currency_rejected(self):
  for response in [self.response('60m'),self.response(currency='USD')]:
   with self.assertRaises(AssertionError):self.fetch(response)
 def test_inconsistent_bars_excluded_without_replacement(self):
  r=self.response();r['chart']['result'][0]['indicators']['quote'][0]['high'][3]=89.1
  c=self.fetch(r);self.assertEqual(len(c['bars']),15);self.assertEqual(len(c['excludedBars']),1)
 def test_hourly_provider_alias(self):
  c=self.fetch(self.response('1h'),self.item('H1'))
  self.assertEqual(c['timeframe'],'H1')

if __name__=='__main__':unittest.main()
