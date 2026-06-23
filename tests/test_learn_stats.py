import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import learn_stats  # noqa: E402


class OutcomeTest(unittest.TestCase):
    def setUp(self):
        self.app = learn_stats.LearnStats()
        self.today = date(2026, 6, 23)

    def test_entry_missing_status_does_not_crash(self):
        kind, pct, ok = self.app.outcome({"priceAtAdvice": 100.0}, self.today)
        self.assertIsNone(kind)
        self.assertFalse(ok)

    def test_bought_entry_missing_first_advised_is_not_measurable(self):
        e = {
            "status": "bought",
            "boughtAt": 100.0,
            "priceHistory": [{"date": "2026-06-20", "price": 110.0}],
        }
        kind, pct, ok = self.app.outcome(e, self.today)
        self.assertEqual(kind, "unrealized")
        self.assertFalse(ok)

    def test_seven_day_pct_missing_first_advised_returns_none(self):
        e = {
            "priceAtAdvice": 100.0,
            "priceHistory": [{"date": "2026-06-20", "price": 110.0}],
        }
        self.assertIsNone(self.app.seven_day_pct(e))


if __name__ == "__main__":
    unittest.main()
