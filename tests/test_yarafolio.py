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

    def test_any_quote_with_price_is_refreshable(self):
        quote1 = {
            "price": 100.0,
            "session": "regular",
            "marketDate": "2026-06-15"}
        quote2 = {
            "price": 101.25,
            "session": "after-hours",
            "marketDate": "2026-06-14"}
        
        self.assertTrue(yarafolio.is_refreshable_quote(quote1, "2026-06-16"))
        self.assertTrue(yarafolio.is_refreshable_quote(quote2, "2026-06-16"))

    def test_quote_without_price_is_not_refreshable(self):
        quote = {"session": "after-hours", "marketDate": "2026-06-15"}
        self.assertFalse(yarafolio.is_refreshable_quote(quote, "2026-06-16"))


if __name__ == "__main__":
    unittest.main()
