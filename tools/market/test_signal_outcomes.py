import unittest
from tools.market.check_signal_outcomes import retain_evidence
class EvidenceRetention(unittest.TestCase):
 def setUp(self):self.old={'event':'ac-example','retrievedAt':'2026-10-26T09:00:00Z','bars':[{'at':'2026-10-26T07:00:00Z','high':2}]}
 def test_failure_preserves_source_time_and_bars(self):
  kept=retain_evidence({'event':'ac-example','bars':[],'error':'AssertionError'},self.old,'2026-10-26T10:00:00Z')
  self.assertEqual(kept['retrievedAt'],self.old['retrievedAt']);self.assertEqual(kept['bars'],self.old['bars']);self.assertNotIn('lastAttempt',self.old)
 def test_missing_intervals_cannot_erase_evidence(self):
  kept=retain_evidence({'event':'ac-example','bars':[]},self.old,'2026-10-26T10:00:00Z');self.assertEqual(kept['bars'],self.old['bars'])
 def test_successful_superset_is_accepted(self):
  new={**self.old,'bars':self.old['bars']+[{'at':'2026-10-26T08:00:00Z','high':3}]};self.assertEqual(retain_evidence(new,self.old,'2026-10-26T10:00:00Z'),new)
if __name__=='__main__':unittest.main()
