import json
import sys
import tempfile
import unittest
import unittest.mock
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import advice_log  # noqa: E402


def _pick_args(ticker, price, **over):
    base = dict(ticker=ticker, price=price, source="advice", rating=None, rsi=None,
                sector=None, buy_below=None, drop_below=None, drop_above=None,
                name=None, reason=None, risk=None, note=None)
    base.update(over)
    return SimpleNamespace(**base)


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


    def test_get_entry_found_any_status(self):
        data = {"entries": [
            {"ticker": "AAPL", "status": "dropped"},
            {"ticker": "MSFT", "status": "watching"},
        ]}
        self.assertEqual(self.app.get_entry(data, "AAPL")["status"], "dropped")

    def test_get_entry_case_insensitive(self):
        data = {"entries": [{"ticker": "AAPL", "status": "watching"}]}
        self.assertIsNotNone(self.app.get_entry(data, "aapl"))

    def test_get_entry_not_found(self):
        data = {"entries": [{"ticker": "AAPL", "status": "watching"}]}
        self.assertIsNone(self.app.get_entry(data, "TSLA"))

    def test_latest_price_missing_history_key(self):
        entry = {"priceAtAdvice": 100.0}
        self.assertEqual(self.app.latest_price(entry), 100.0)

    def test_find_ignores_entry_without_status(self):
        data = {"entries": [{"ticker": "AAPL"}, {"ticker": "MSFT", "status": "watching"}]}
        self.assertIsNone(self.app.find(data, "AAPL"))
        self.assertIsNotNone(self.app.find(data, "MSFT"))


class AddPickTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump({"entries": [], "lastUpdated": ""}, self.tmp)
        self.tmp.close()
        self.app = advice_log.AdviceLog()
        self.app.log_file = self.tmp.name

    def tearDown(self):
        Path(self.tmp.name).unlink(missing_ok=True)

    def _entries(self):
        with open(self.tmp.name) as f:
            return json.load(f)["entries"]

    def test_add_new_pick(self):
        self.app.cmd_add_pick(_pick_args(
            "AAPL", 170.0, rating="B+", rsi=27, sector="Technology",
            buy_below=165.0, drop_below=150.0, reason="oversold"))
        entries = self._entries()
        self.assertEqual(len(entries), 1)
        e = entries[0]
        self.assertEqual(e["ticker"], "AAPL")
        self.assertEqual(e["status"], "watching")
        self.assertEqual(e["priceAtAdvice"], 170.0)
        self.assertEqual(e["rating"], "B+")
        self.assertEqual(len(e["priceHistory"]), 1)

    def test_readvise_upserts_not_duplicates(self):
        self.app.cmd_add_pick(_pick_args("AAPL", 170.0, rating="B+"))
        self.app.cmd_add_pick(_pick_args("AAPL", 172.0, rating="A-", note="re-advised"))
        entries = self._entries()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["rating"], "A-")
        # priceAtAdvice is the first-advice price; the new price lands in history
        self.assertEqual(entries[0]["priceAtAdvice"], 170.0)

    def _seed(self, entries):
        with open(self.tmp.name, "w") as f:
            json.dump({"entries": entries, "lastUpdated": ""}, f)

    def test_readvise_bought_ticker_upserts_not_duplicates(self):
        # Re-advising a ticker you already hold must refresh the position, not
        # spawn a lot-less 'watching' ghost that lingers in the Advice tab.
        self._seed([{
            "id": "ACN-0001", "ticker": "ACN", "status": "bought", "source": "advice",
            "rating": "A-", "priceAtAdvice": 133.2,
            "priceHistory": [{"date": "2026-06-18", "price": 133.2}],
            "notes": [], "lots": [{"positionID": 1, "openRate": 126.0}],
        }])
        self.app.cmd_add_pick(_pick_args(
            "ACN", 127.0, source="aftermarket", rating="B", reason="oversold flush"))
        entries = self._entries()
        self.assertEqual(len(entries), 1)
        e = entries[0]
        self.assertEqual(e["status"], "bought")       # stays a position
        self.assertEqual(e["rating"], "B")            # refreshed to latest advice
        self.assertEqual(len(e["lots"]), 1)           # lots untouched
        self.assertEqual(len(e["priceHistory"]), 2)   # new price point appended
        self.assertTrue(any("oversold flush" in n.get("text", "") for n in e["notes"]))

    def test_readvise_does_not_merge_into_import_holding(self):
        self._seed([{
            "id": "ADBE-0001", "ticker": "ADBE", "status": "bought", "source": "import",
            "priceHistory": [], "notes": [], "lots": [],
        }])
        self.app.cmd_add_pick(_pick_args("ADBE", 200.0, source="advice", rating="B"))
        entries = self._entries()
        self.assertEqual(len(entries), 2)             # import holding stays separate
        new = [x for x in entries if x["id"] != "ADBE-0001"][0]
        self.assertEqual(new["status"], "watching")

    def test_remove_deletes_by_id(self):
        self._seed([
            {"id": "ACN-0001", "ticker": "ACN", "status": "bought", "lots": []},
            {"id": "ACN-0002", "ticker": "ACN", "status": "watching", "lots": []},
        ])
        self.app.cmd_remove(SimpleNamespace(id="ACN-0002", force=False))
        self.assertEqual([e["id"] for e in self._entries()], ["ACN-0001"])

    def test_remove_guards_position_with_lots(self):
        self._seed([{"id": "ACN-0001", "ticker": "ACN", "status": "bought",
                     "lots": [{"positionID": 1}]}])
        with self.assertRaises(SystemExit):
            self.app.cmd_remove(SimpleNamespace(id="ACN-0001", force=False))
        self.assertEqual(len(self._entries()), 1)     # guarded, not removed

    def test_new_pick_seeds_adviceEvents_with_today(self):
        self.app.cmd_add_pick(_pick_args("AAPL", 170.0))
        self.assertEqual(self._entries()[0]["adviceEvents"],
                         [{"date": date.today().isoformat(), "price": 170.0}])

    def test_readvise_accumulates_adviceEvents(self):
        # adviceEvents lets the Positions view show which advice (date + price)
        # prompted each lot.
        self._seed([{
            "id": "ACN-0001", "ticker": "ACN", "status": "bought", "source": "advice",
            "firstAdvised": "2026-01-01", "priceAtAdvice": 133.2,
            "priceHistory": [], "notes": [], "lots": [],
        }])
        self.app.cmd_add_pick(_pick_args("ACN", 127.0, source="aftermarket"))
        e = self._entries()[0]
        self.assertEqual(e["adviceEvents"], [
            {"date": "2026-01-01", "price": 133.2},
            {"date": date.today().isoformat(), "price": 127.0},
        ])

    def test_readvise_migrates_legacy_adviceDates(self):
        # An entry created before adviceEvents existed must not keep the dead field.
        self._seed([{
            "id": "ACN-0001", "ticker": "ACN", "status": "bought", "source": "advice",
            "firstAdvised": "2026-01-01", "priceAtAdvice": 133.2, "adviceDates": ["2026-01-01"],
            "priceHistory": [], "notes": [], "lots": [],
        }])
        self.app.cmd_add_pick(_pick_args("ACN", 127.0, source="aftermarket"))
        e = self._entries()[0]
        self.assertNotIn("adviceDates", e)
        self.assertEqual(e["adviceEvents"][-1], {"date": date.today().isoformat(), "price": 127.0})


if __name__ == "__main__":
    unittest.main()
