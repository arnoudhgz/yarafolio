import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import price_history  # noqa: E402


class PushPricePointTest(unittest.TestCase):
    def test_appends_to_empty_history(self):
        hist = []
        price_history.push_price_point(hist, 100.0, now=datetime(2026, 6, 16, 15, 30))
        self.assertEqual(hist, [{"date": "2026-06-16T15:30", "price": 100.0}])

    def test_updates_price_in_same_minute(self):
        hist = [{"date": "2026-06-16T15:30", "price": 105.0}]
        price_history.push_price_point(hist, 107.0, now=datetime(2026, 6, 16, 15, 30))
        self.assertEqual(hist, [{"date": "2026-06-16T15:30", "price": 107.0}])

    def test_skips_same_price_on_same_day(self):
        hist = [{"date": "2026-06-16T15:30", "price": 105.0}]
        price_history.push_price_point(hist, 105.0, now=datetime(2026, 6, 16, 15, 35))
        self.assertEqual(hist, [{"date": "2026-06-16T15:30", "price": 105.0}])

    def test_appends_same_price_on_different_day_and_prunes_prior(self):
        hist = [{"date": "2026-06-16T15:30", "price": 105.0}]
        price_history.push_price_point(hist, 105.0, now=datetime(2026, 6, 17, 10, 0))
        self.assertEqual(hist, [
            {"date": "2026-06-16", "price": 105.0},
            {"date": "2026-06-17T10:00", "price": 105.0},
        ])

    def test_prunes_past_intraday_to_last_per_day_keeps_today(self):
        hist = [
            {"date": "2026-06-15T10:00", "price": 105.0},
            {"date": "2026-06-15T12:00", "price": 106.5},
        ]
        price_history.push_price_point(hist, 107.0, now=datetime(2026, 6, 16, 15, 30))
        self.assertEqual(hist, [
            {"date": "2026-06-15", "price": 106.5},
            {"date": "2026-06-16T15:30", "price": 107.0},
        ])

    def test_returns_the_same_list_object(self):
        hist = []
        result = price_history.push_price_point(hist, 100.0, now=datetime(2026, 6, 16, 15, 30))
        self.assertIs(result, hist)


if __name__ == "__main__":
    unittest.main()
