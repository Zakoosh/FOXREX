import unittest,json
from pathlib import Path
from unittest.mock import patch
import ai_technical as ai
class TechnicalTests(unittest.TestCase):
 def setUp(self):
  snap=json.loads((ai.ROOT/'data/market/ai-technical.json').read_text());self.d=next(d for d in snap['instruments'] if d['symbol']=='EURUSD');self.bars=self.d['bars']
 def test_levels_use_only_last_twenty_completed_observations(self):
  bars=self.bars[:100];m=ai.metrics(bars)
  self.assertEqual(m['support'],min(b['low'] for b in bars[-20:]));self.assertEqual(m['resistance'],max(b['high'] for b in bars[-20:]));self.assertIsNone(m['ema200']);self.assertGreaterEqual(m['rsi14'],0);self.assertLessEqual(m['rsi14'],100)
 def test_short_history_never_fabricates_long_ema(self):
  self.assertIsNone(ai.ema([b['close'] for b in self.bars[:199]],200));self.assertIsNotNone(ai.ema([b['close'] for b in self.bars[:200]],200))
 def test_partial_invalid_bars_and_future_quote_rejected(self):
  now=ai.epoch(self.bars[-1]['at'])+1800
  valid=self.bars[:80];q={k:[b[k] for b in valid] for k in ('open','high','low','close')};q['low'][2]=-1
  result={'meta':{'symbol':'EURUSD=X','currency':'USD','instrumentType':'CURRENCY','dataGranularity':'1h','regularMarketPrice':1.1,'regularMarketTime':now},'timestamp':[ai.epoch(b['at']) for b in valid],'indicators':{'quote':[q]}}
  result['timestamp'][-1]=now
  with patch.object(ai,'fetch',return_value={'chart':{'result':[result]}}):d=ai.intake('EURUSD',now)
  self.assertEqual(len(d['bars']),78);self.assertEqual(len(d['excluded']),2);self.assertLessEqual(ai.epoch(d['dataAsOf']),now)
  result['meta']['regularMarketTime']=now+100
  with patch.object(ai,'fetch',return_value={'chart':{'result':[result]}}):
   with self.assertRaises(AssertionError):ai.intake('EURUSD',now)
 def test_spot_fallback_never_pretends_to_be_hourly(self):
  with patch.object(ai,'fetch',side_effect=OSError):d=ai.intake('XAUUSD',ai.epoch(self.d['retrievedAt']))
  self.assertEqual(d['timeframe'],'D1');self.assertEqual(d['dataAsOf'][:10],'2026-10-23');self.assertIsNone(d['quote']);self.assertIn('H1 unavailable',d['limitation']);self.assertIsNone(ai.calculate(d)['ema200'])
if __name__=='__main__':unittest.main()
