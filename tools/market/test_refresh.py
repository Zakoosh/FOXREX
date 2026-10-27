import unittest,datetime
from unittest.mock import patch
from tools.market import refresh
class QuoteIntegrity(unittest.TestCase):
 def setUp(self):self.now=datetime.datetime(2026,10,26,tzinfo=datetime.timezone.utc)
 def test_price_and_time_validation(self):
  base=dict(symbol='XAUUSD',price=4000.0,asOf='2026-10-25T23:00:00Z')
  self.assertEqual(refresh.checked(base,self.now),base)
  for price in (float('inf'),float('nan'),0,-1,True):
   with self.assertRaises(AssertionError):refresh.checked(dict(base,price=price),self.now)
  with self.assertRaises(AssertionError):refresh.checked(dict(base,asOf='2026-10-27T00:00:00Z'),self.now)
 def test_timezone_is_required(self):
  with self.assertRaises(AssertionError):refresh.checked(dict(symbol='XAUUSD',price=4000,asOf='2026-10-25T23:00:00'),self.now)
 def test_gold_currency_and_symbol_must_match(self):
  with patch.object(refresh,'fetch',return_value=dict(symbol='XAG',currency='USD',price=50,updatedAt='2026-10-25T23:00:00Z')):
   with self.assertRaises(AssertionError):refresh.quote(('XAUUSD','XAU'),self.now)
 def test_fx_mapping_is_not_silently_inverted(self):
  meta=dict(symbol='JPY=X',currency='USD',regularMarketPrice=157,regularMarketTime=1792969200)
  with patch.object(refresh,'fetch',return_value={'chart':{'result':[{'meta':meta}]}}):
   with self.assertRaises(AssertionError):refresh.quote(('USDJPY','JPY=X'),self.now)
class SessionDeskSymbols(unittest.TestCase):
 def test_desk_symbols_have_units_and_keep_core_order(self):
  self.assertEqual([s for s,_ in refresh.PAIRS[:9]],['XAUUSD','XAGUSD','EURUSD','GBPUSD','USDJPY','BTCUSD','SPX','NAS100','US30'])
  for s,k in refresh.PAIRS:
   if k not in ('XAU','XAG','BTC'):self.assertIn(s,refresh.UNITS)
 def test_dxy_and_yield_quotes_map_without_inversion(self):
  now=datetime.datetime(2026,10,27,12,tzinfo=datetime.timezone.utc)
  for sym,key,price in (('DXY','DX-Y.NYB',101.9),('US10Y','^TNX',4.99)):
   meta=dict(symbol=key,currency='USD',instrumentType='INDEX',regularMarketPrice=price,regularMarketTime=1793095200,regularMarketChangePercent=0.2)
   with patch.object(refresh,'fetch',return_value={'chart':{'result':[{'meta':meta}]}}):
    q=refresh.quote((sym,key),now)
   self.assertEqual((q['symbol'],q['price'],q['dailyChangePct']),(sym,price,0.2))
class GoldDailyBars(unittest.TestCase):
 def test_completed_sessions_only_and_invalid_bars_skipped(self):
  now=datetime.datetime(2026,10,27,12,tzinfo=datetime.timezone.utc)
  start=datetime.datetime(2026,9,1,4,tzinfo=datetime.timezone.utc)
  ts=[int((start+datetime.timedelta(days=i)).timestamp()) for i in range(57)]
  o=[4000.0]*57;h=[4010.0]*57;l=[3990.0]*57;c=[4005.0]*57;h[3]=3000.0
  meta=dict(symbol='GC=F',currency='USD',exchangeTimezoneName='America/New_York')
  with patch.object(refresh,'fetch',return_value={'chart':{'result':[{'meta':meta,'timestamp':ts,'indicators':{'quote':[dict(open=o,high=h,low=l,close=c)]}}]}}):
   d=refresh.gold_daily(now)
  dates=[b['date'] for b in d['bars']]
  self.assertEqual(dates[-1],'2026-10-26');self.assertNotIn('2026-10-27',dates);self.assertNotIn('2026-09-04',dates)
class DailyChangeIntegrity(unittest.TestCase):
 def test_provider_session_change_is_used_not_five_day_chart_reference(self):
  q=dict(price=110,sourceUrl='https://example.com')
  r=refresh.yahoo_change(q,{'meta':{'regularMarketChangePercent':10,'chartPreviousClose':50}})
  self.assertEqual(r['dailyChangePct'],10)
 def test_missing_baseline_never_becomes_zero_change(self):
  r=refresh.yahoo_change(dict(price=110,sourceUrl='https://example.com'),{'meta':{'regularMarketTime':1793021400,'exchangeTimezoneName':'America/New_York'}})
  self.assertNotIn('dailyChangePct',r)
 def test_previous_weekday_skips_weekend(self):
  self.assertEqual(refresh.previous_weekday(datetime.date(2026,10,26)),datetime.date(2026,10,23))
if __name__=='__main__':unittest.main()
