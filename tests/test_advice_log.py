import sys
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import advice_log  # noqa: E402


class AdviceLogTest(unittest.TestCase):
    def setUp(self):
        self.app = advice_log.AdviceLog()

    def test_find_returns_watching_or_bought_entry(self):
        data = {
            "entries": [
                {"ticker": "AAPL", "status": "watching"},
                {"ticker": "MSFT", "status": "sold"},
            ]
        }

        self.assertIsNotNone(self.app.find(data, "AAPL"))
        self.assertIsNone(self.app.find(data, "MSFT"))
        self.assertIsNone(self.app.find(data, "GOOG"))

    def test_find_by_id(self):
        data = {
            "entries": [
                {"ticker": "AAPL", "id": "AAPL-0001"},
            ]
        }

        self.assertIsNotNone(self.app.find_by_id(data, "AAPL-0001"))
        self.assertIsNone(self.app.find_by_id(data, "AAPL-0002"))

    def test_latest_price_from_history(self):
        entry = {
            "priceAtAdvice": 100.0,
            "priceHistory": [
                {"date": "2026-06-15 10:00", "price": 105.0},
                {"date": "2026-06-15 12:00", "price": 106.5}
            ]
        }
        self.assertEqual(self.app.latest_price(entry), 106.5)

    def test_latest_price_fallback_to_advice_price(self):
        entry = {
            "priceAtAdvice": 100.0,
            "priceHistory": []
        }
        self.assertEqual(self.app.latest_price(entry), 100.0)

    @unittest.mock.patch('advice_log.datetime')
    def test_push_history_prunes_past_intraday_points_and_appends(self, mock_dt):
        mock_dt.now.return_value = unittest.mock.Mock(
            strftime=lambda fmt: "2026-06-16 15:30" if "%H" in fmt else "2026-06-16"
        )
        entry = {
            "priceHistory": [
                {"date": "2026-06-15 10:00", "price": 105.0},
                {"date": "2026-06-15 12:00", "price": 106.5},
            ]
        }
        self.app.push_history(entry, 107.0)
        hist = entry["priceHistory"]
        self.assertEqual(len(hist), 2)
        self.assertEqual(hist[0], {"date": "2026-06-15", "price": 106.5})
        self.assertEqual(hist[1], {"date": "2026-06-16 15:30", "price": 107.0})

    @unittest.mock.patch('advice_log.datetime')
    def test_push_history_updates_price_if_same_minute(self, mock_dt):
        mock_dt.now.return_value = unittest.mock.Mock(
            strftime=lambda fmt: "2026-06-16 15:30" if "%H" in fmt else "2026-06-16"
        )
        entry = {
            "priceHistory": [
                {"date": "2026-06-16 15:30", "price": 105.0},
            ]
        }
        self.app.push_history(entry, 107.0)
        hist = entry["priceHistory"]
        self.assertEqual(len(hist), 1)
        self.assertEqual(hist[0], {"date": "2026-06-16 15:30", "price": 107.0})

    @unittest.mock.patch('advice_log.datetime')
    def test_push_history_skips_same_price_on_same_day(self, mock_dt):
        mock_dt.now.return_value = unittest.mock.Mock(
            strftime=lambda fmt: "2026-06-16 15:35" if "%H" in fmt else "2026-06-16"
        )
        entry = {
            "priceHistory": [
                {"date": "2026-06-16 15:30", "price": 105.0},
            ]
        }
        self.app.push_history(entry, 105.0)
        hist = entry["priceHistory"]
        self.assertEqual(len(hist), 1)
        self.assertEqual(hist[0], {"date": "2026-06-16 15:30", "price": 105.0})

    @unittest.mock.patch('advice_log.datetime')
    def test_push_history_appends_same_price_different_day(self, mock_dt):
        mock_dt.now.return_value = unittest.mock.Mock(
            strftime=lambda fmt: "2026-06-17 10:00" if "%H" in fmt else "2026-06-17"
        )
        entry = {
            "priceHistory": [
                {"date": "2026-06-16 15:30", "price": 105.0},
            ]
        }
        self.app.push_history(entry, 105.0)
        hist = entry["priceHistory"]
        self.assertEqual(len(hist), 2)
        self.assertEqual(hist[0], {"date": "2026-06-16", "price": 105.0})
        self.assertEqual(hist[1], {"date": "2026-06-17 10:00", "price": 105.0})


if __name__ == "__main__":
    unittest.main()
