import sys
import unittest
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


if __name__ == "__main__":
    unittest.main()
