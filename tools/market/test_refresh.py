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
