import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import etoro_import  # noqa: E402


class EtoroImportTest(unittest.TestCase):
    def test_sector_for(self):
        app = etoro_import.EtoroImport()
        industries = {1: "Technology", 2: "Healthcare"}
        self.assertEqual(app.sector_for(
            {"instrumentTypeID": 5, "stocksIndustryID": 1}, industries), "Technology")
        self.assertEqual(app.sector_for(
            {"instrumentTypeID": 5, "stocksIndustryID": 2}, industries), "Healthcare")
        self.assertEqual(app.sector_for(
            {"instrumentTypeID": 5, "stocksIndustryID": 99}, industries), "ETF / Other")
        self.assertEqual(app.sector_for(
            {"instrumentTypeID": 1, "stocksIndustryID": 1}, industries), "ETF / Other")

    def test_rollup_entry_sold(self):
        app = etoro_import.EtoroImport()
        entry = {
            "lots": [
                {
                    "units": 2.0,
                    "openRate": 100.0,
                    "soldAt": 110.0,
                    "exitEstimated": False
                },
                {
                    "units": 1.0,
                    "openRate": 120.0,
                    "soldAt": 105.0,
                    "exitEstimated": False
                }
            ]
        }
        app.rollup_entry(entry, 105.0)
        self.assertEqual(entry["status"], "sold")
        self.assertAlmostEqual(entry["units"], 3.0)
        # (2*100 + 1*120) / 3 = 320 / 3 = 106.6667
        self.assertAlmostEqual(entry["boughtAt"], 106.6667, places=4)
        # (2*110 + 1*105) / 3 = 325 / 3 = 108.3333
        self.assertAlmostEqual(entry["soldAt"], 108.3333, places=4)

    def test_rollup_entry_open(self):
        app = etoro_import.EtoroImport()
        entry = {
            "lots": [
                {
                    "units": 1.0,
                    "openRate": 100.0,
                    "soldAt": None,
                    "tslEnabled": True,
                }
            ]
        }
        app.rollup_entry(entry, 105.0)
        self.assertEqual(entry["status"], "bought")
        self.assertEqual(entry["units"], 1.0)
        self.assertTrue(entry["tslSet"])


if __name__ == "__main__":
    unittest.main()
