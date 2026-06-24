import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import screen  # noqa: E402


class ParseQuoteTest(unittest.TestCase):
    def parse(self, markup):
        with patch.object(screen.Screen, "fetch_symbol", return_value=markup):
            app = screen.Screen()
            return app.parse_quote("TEST")

    def test_regular_quote(self):
        quote = self.parse(
            '<div class="text-4xl font-bold">291.13</div>'
            '<span>At close:</span> Jun 12, 2026, 4:00 PM EDT')

        self.assertEqual(quote["price"], 291.13)
        self.assertEqual(quote["session"], "regular")
        self.assertEqual(quote["marketDate"], "2026-06-12")

    def test_premarket_quote_is_preferred(self):
        quote = self.parse(
            '<div class="text-4xl font-bold">291.13</div>'
            '<span>At close:</span> Jun 12, 2026, 4:00 PM EDT'
            '<div class="text-[1.7rem] font-semibold">293.63</div>'
            '<span><span>Pre-market:</span></span> '
            '<span>Jun 15, 2026, 4:05 AM EDT</span>')

        self.assertEqual(quote["price"], 293.63)
        self.assertEqual(quote["regularPrice"], 291.13)
        self.assertEqual(quote["session"], "pre-market")
        self.assertEqual(quote["marketDate"], "2026-06-15")

    def test_after_hours_quote_is_preferred(self):
        quote = self.parse(
            '<div class="text-4xl font-bold">100.00</div>'
            '<span>At close:</span> Jun 15, 2026, 4:00 PM EDT'
            '<div class="text-[1.7rem] font-semibold">101.25</div>'
            '<span><span>After-hours:</span></span> '
            '<span>Jun 15, 2026, 7:59 PM EDT</span>')

        self.assertEqual(quote["price"], 101.25)
        self.assertEqual(quote["session"], "after-hours")
        self.assertEqual(quote["marketDate"], "2026-06-15")

    def test_regular_market_open_label(self):
        quote = self.parse(
            '<div class="text-4xl font-bold">102.50</div>'
            '<span>Market open:</span> Jun 15, 2026, 10:15 AM EDT')

        self.assertEqual(quote["price"], 102.50)
        self.assertEqual(quote["session"], "regular")
        self.assertEqual(quote["marketDate"], "2026-06-15")


class QuoteSessionNoteTest(unittest.TestCase):
    def test_regular_session_has_no_note(self):
        self.assertEqual(screen.quote_session_note({"session": "regular"}), "")

    def test_missing_session_has_no_note(self):
        self.assertEqual(screen.quote_session_note({}), "")

    def test_premarket_note_includes_session_and_as_of(self):
        note = screen.quote_session_note(
            {"session": "pre-market", "asOf": "Jun 15, 2026, 4:05 AM EDT"})
        self.assertEqual(note, "pre-market, as of Jun 15, 2026, 4:05 AM EDT")

    def test_after_hours_note_without_as_of(self):
        self.assertEqual(
            screen.quote_session_note({"session": "after-hours"}), "after-hours")


if __name__ == "__main__":
    unittest.main()
