import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import entries  # noqa: E402


class NormalizeEntryTest(unittest.TestCase):
    def test_fills_missing_list_fields(self):
        e = {"ticker": "AAPL"}
        entries.normalize_entry(e)
        self.assertEqual(e["priceHistory"], [])
        self.assertEqual(e["notes"], [])
        self.assertEqual(e["lots"], [])

    def test_replaces_non_list_values_with_empty_list(self):
        e = {"ticker": "AAPL", "priceHistory": None, "notes": "oops"}
        entries.normalize_entry(e)
        self.assertEqual(e["priceHistory"], [])
        self.assertEqual(e["notes"], [])

    def test_preserves_existing_lists(self):
        hist = [{"date": "2026-06-16", "price": 100.0}]
        e = {"ticker": "AAPL", "priceHistory": hist}
        entries.normalize_entry(e)
        self.assertIs(e["priceHistory"], hist)

    def test_returns_the_entry(self):
        e = {"ticker": "AAPL"}
        self.assertIs(entries.normalize_entry(e), e)


if __name__ == "__main__":
    unittest.main()
