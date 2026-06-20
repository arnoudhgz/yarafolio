import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import yarafolio  # noqa: E402

class RefreshableQuoteTest(unittest.TestCase):
    def test_same_day_quote_is_refreshable(self):
        quote = {
            "price": 101.0,
            "session": "regular",
            "marketDate": "2026-06-16"}

        self.assertTrue(yarafolio.is_refreshable_quote(quote, "2026-06-16"))

    def test_previous_day_after_hours_quote_is_refreshable(self):
        quote = {
            "price": 101.25,
            "session": "after-hours",
            "marketDate": "2026-06-15"}

        self.assertTrue(yarafolio.is_refreshable_quote(quote, "2026-06-16"))

    def test_previous_day_regular_quote_is_stale(self):
        quote = {
            "price": 100.0,
            "session": "regular",
            "marketDate": "2026-06-15"}

        self.assertFalse(yarafolio.is_refreshable_quote(quote, "2026-06-16"))

    def test_older_after_hours_quote_is_stale(self):
        quote = {
            "price": 101.25,
            "session": "after-hours",
            "marketDate": "2026-06-14"}

        self.assertFalse(yarafolio.is_refreshable_quote(quote, "2026-06-16"))

    def test_quote_without_price_is_stale(self):
        quote = {"session": "after-hours", "marketDate": "2026-06-15"}

        self.assertFalse(yarafolio.is_refreshable_quote(quote, "2026-06-16"))


if __name__ == "__main__":
    unittest.main()
