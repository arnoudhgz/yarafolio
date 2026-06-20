#!/usr/bin/env python3
"""Import eToro positions into the advice tracker.

Usage:
  python3 scripts/etoro_import.py preview   # fetch + print table, write tmp/etoro-import-preview.json
  python3 scripts/etoro_import.py merge     # merge the preview into data/advice-log.json

Reads ETORO_API_KEY and ETORO_USER_KEY from the project .env file. Environment
variables override values from the file.
Read-only: only GET requests, never the trading/order endpoints.
merge also writes data/portfolio.json, the full holdings snapshot for the dashboard.
"""
import json
import os
import sys
import urllib.request
import uuid
import logging
from datetime import date

BASE = "https://public-api.etoro.com/api/v1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
logger = logging.getLogger("etoro_import")
logger.setLevel(logging.INFO)
logger.handlers = []

fh = logging.FileHandler(os.path.join(ROOT, "logs", "app.log"))
fh.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(fh)

ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter('%(message)s'))
logger.addHandler(ch)

def get_env(key):
    v = os.environ.get(key)
    if v is not None: return v
    try:
        with open(os.path.join(ROOT, ".env")) as f:
            for line in f:
                k, _, val = line.partition("=")
                if k.replace("export", "").strip() == key:
                    return val.strip().strip("\"'")
    except OSError:
        pass
    return None


class EtoroImport:
    def __init__(self):
        is_demo = get_env("DEMO_MODE") == "1"
        self.subdir = "sample" if is_demo else "private"
        self.log_file = os.path.join(ROOT, "data", self.subdir, "advice-log.json")
        self.portfolio_file = os.path.join(ROOT, "data", self.subdir, "portfolio.json")
        self.instruments_cache = os.path.join(ROOT, "data", "instruments.json")
        self.preview_file = os.path.join(ROOT, "tmp", "etoro-import-preview.json")

    def credentials(self):
        creds = {}
        env_file = os.path.join(ROOT, ".env")
        try:
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.removeprefix("export ").strip()
                    creds[key] = value.strip().strip("\"'")
        except OSError as exc:
            raise RuntimeError(f"Cannot read project environment file {env_file}: {exc}") from exc

        suffix = os.environ.get("ETORO_SUFFIX", "")
        
        if "ETORO_API_KEY" in os.environ:
            creds["ETORO_API_KEY"] = os.environ["ETORO_API_KEY"]
            
        user_key_name = f"ETORO_USER_KEY_{suffix}" if suffix else "ETORO_USER_KEY"
        if user_key_name in os.environ:
            creds["ETORO_USER_KEY"] = os.environ[user_key_name]
        elif user_key_name in creds:
            creds["ETORO_USER_KEY"] = creds[user_key_name]

        if not creds.get("ETORO_API_KEY"):
            raise RuntimeError(f"Missing ETORO_API_KEY in {env_file}")
        if not creds.get("ETORO_USER_KEY"):
            raise RuntimeError(f"Missing {user_key_name} in {env_file}")
                
        return creds

    def get(self, path, creds):
        import urllib.error
        req = urllib.request.Request(BASE + path, headers={
            "x-api-key": creds["ETORO_API_KEY"],
            "x-user-key": creds["ETORO_USER_KEY"],
            "x-request-id": str(uuid.uuid4()),
            "Accept": "application/json",
            "User-Agent": "curl/8.7.1",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                sys.exit(f"eToro Authentication Failed ({exc.code}): Please check your ETORO_API_KEY and ETORO_USER_KEY in .env")
            else:
                sys.exit(f"eToro API Error ({exc.code}): {exc.reason}")

    def chunked(self, items, size=50):
        for i in range(0, len(items), size):
            yield items[i:i + size]

    def atomic_write(self, path, payload):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        os.replace(tmp, path)

    def fetch_industries(self, creds):
        try:
            rows = self.get("/market-data/stocks-industries", creds)["stocksIndustries"]
            return {r["industryID"]: r["industryName"] for r in rows}
        except Exception as exc:
            logger.warning(f"warning: industries fetch failed ({exc}), sectors left unknown")
            return None

    def sector_for(self, meta_record, industries):
        if not meta_record or industries is None:
            return None
        if meta_record.get("instrumentTypeID") != 5:
            return "ETF / Other"
        return industries.get(meta_record.get("stocksIndustryID"), "ETF / Other")

    def fetch_preview(self):
        creds = self.credentials()
        portfolio = self.get("/trading/info/portfolio", creds)
        positions = portfolio["clientPortfolio"]["positions"]
        industries = self.fetch_industries(creds)

        by_instrument = {}
        for p in positions:
            by_instrument.setdefault(p["instrumentID"], []).append(p)

        ids = sorted(by_instrument)
        meta, rates = {}, {}
        for chunk in self.chunked(ids):
            param = ",".join(map(str, chunk))
            for m in self.get(f"/market-data/instruments?instrumentIds={param}", creds)["instrumentDisplayDatas"]:
                meta[m["instrumentID"]] = m
            for r in self.get(f"/market-data/instruments/rates?instrumentIds={param}", creds)["rates"]:
                rates[r["instrumentID"]] = r

        entries = []
        for iid in ids:
            plist = by_instrument[iid]
            units = sum(p["units"] for p in plist)
            avg_open = sum(p["units"] * p["openRate"] for p in plist) / units
            invested = sum(p["initialAmountInDollars"] for p in plist)
            first_open = min(p["openDateTime"] for p in plist)[:10]
            m = meta.get(iid, {})
            rate = rates.get(iid, {})
            current = rate.get("lastExecution") or rate.get("bid")
            pl_dollar = round(units * current - invested, 2) if current else None
            pl_pct = round(pl_dollar / invested * 100, 2) if pl_dollar is not None and invested else None
            entries.append({
                "ticker": m.get("symbolFull", f"ID{iid}"),
                "name": m.get("instrumentDisplayName", ""),
                "instrumentID": iid,
                "sector": self.sector_for(m, industries),
                "positions": len(plist),
                "units": round(units, 6),
                "invested": round(invested, 2),
                "boughtAt": round(avg_open, 4),
                "currentPrice": current,
                "plDollar": pl_dollar,
                "plPct": pl_pct,
                "firstOpen": first_open,
                "tslEnabled": any(p.get("isTslEnabled") for p in plist),
                "lots": [{
                    "positionID": p["positionID"],
                    "openDate": p["openDateTime"][:10],
                    "openRate": round(p["openRate"], 4),
                    "units": round(p["units"], 6),
                    "tslEnabled": bool(p.get("isTslEnabled")),
                } for p in plist],
            })

        self.atomic_write(self.preview_file, entries)

        cache = {}
        if os.path.exists(self.instruments_cache):
            with open(self.instruments_cache) as f:
                cache = json.load(f)
        for iid, m in meta.items():
            record = cache.get(str(iid), {})
            record["ticker"] = m["symbolFull"]
            record["name"] = m["instrumentDisplayName"]
            sector = self.sector_for(m, industries)
            if sector is not None:
                record["sector"] = sector
            cache[str(iid)] = record
        self.atomic_write(self.instruments_cache, cache)

        logger.info(f"{len(entries)} instruments, {len(positions)} positions, "
              f"${sum(e['invested'] for e in entries):,.2f} invested")
        logger.info(f"Preview written to {self.preview_file}")

    def write_portfolio(self, preview, today):
        self.atomic_write(self.portfolio_file, {
            "lastUpdated": today,
            "totalInvested": round(sum(i["invested"] for i in preview), 2),
            "holdings": [{
                "ticker": i["ticker"], "name": i["name"], "instrumentID": i["instrumentID"],
                "sector": i["sector"], "positions": i["positions"], "units": i["units"],
                "invested": i["invested"], "avgOpen": i["boughtAt"],
                "currentPrice": i["currentPrice"], "plDollar": i["plDollar"],
                "plPct": i["plPct"], "firstOpen": i["firstOpen"],
                "lots": i["lots"]
            } for i in preview],
        })

    def reconcile_lots(self, entry, item, today):
        first = entry.get("firstAdvised") or ""
        dropped = entry.get("droppedDate")
        live = {}
        for lot in (item.get("lots", []) if item else []):
            if lot["openDate"] < first:
                continue
            if dropped and lot["openDate"] >= dropped:
                continue
            live[lot["positionID"]] = lot
        current = item.get("currentPrice") if item else None
        lots = entry.setdefault("lots", [])
        have = {l["positionID"]: l for l in lots}
        for pid, lot in live.items():
            if pid not in have:
                lots.append({"positionID": pid, "openDate": lot["openDate"], "openRate": lot["openRate"],
                             "units": lot["units"], "lastPrice": current or lot["openRate"],
                             "tslEnabled": bool(lot.get("tslEnabled")), "soldAt": None, "exitEstimated": False})
            elif have[pid].get("soldAt") is None:
                have[pid]["tslEnabled"] = bool(lot.get("tslEnabled"))
                if current:
                    have[pid]["lastPrice"] = current
        closed = 0
        for l in lots:
            if l.get("soldAt") is None and l["positionID"] not in live:
                l["soldAt"] = l.get("lastPrice") or l["openRate"]
                l["exitEstimated"] = True
                l["closedDate"] = today
                closed += 1
        if closed:
            entry.setdefault("notes", []).append({
                "date": today,
                "text": f"Auto-closed {closed} lot(s) gone from eToro on {today}; exit estimated at "
                        f"last-seen price, confirm the real exit."})
        if lots:
            self.rollup_entry(entry, current)
        return closed

    def rollup_entry(self, entry, current_price):
        lots = entry["lots"]
        open_lots = [l for l in lots if l.get("soldAt") is None]
        total_units = sum(l["units"] for l in lots) or 1
        entry["boughtAt"] = round(sum(l["openRate"] * l["units"] for l in lots) / total_units, 4)
        if open_lots:
            entry["status"] = "bought"
            entry["units"] = round(sum(l["units"] for l in open_lots), 6)
            entry["soldAt"] = None
            entry["tslSet"] = any(l.get("tslEnabled") for l in open_lots)
            entry.pop("exitEstimated", None)
        else:
            entry["status"] = "sold"
            entry["units"] = round(sum(l["units"] for l in lots), 6)
            entry["soldAt"] = round(sum((l.get("soldAt") or 0) * l["units"] for l in lots) / total_units, 4)
            entry["exitEstimated"] = any(l.get("exitEstimated") for l in lots)
        if current_price:
            hist = entry.setdefault("priceHistory", [])
            from datetime import datetime
            now = datetime.now()
            now_str = now.strftime("%Y-%m-%d %H:%M")
            today_str = now.strftime("%Y-%m-%d")
            
            if hist and hist[-1]["price"] == current_price:
                pass
            elif hist and hist[-1]["date"] == now_str:
                hist[-1]["price"] = current_price
            else:
                hist.append({"date": now_str, "price": current_price})
                
            new_hist = []
            for i, point in enumerate(hist):
                date_str = point["date"][:10]
                if date_str == today_str:
                    new_hist.append(point)
                else:
                    is_last = True
                    if i + 1 < len(hist) and hist[i+1]["date"][:10] == date_str:
                        is_last = False
                    if is_last:
                        new_hist.append({"date": date_str, "price": point["price"]})
            entry["priceHistory"] = new_hist

    def merge(self):
        with open(self.preview_file) as f:
            preview = json.load(f)
        with open(self.log_file) as f:
            data = json.load(f)

        today = date.today().isoformat()
        self.write_portfolio(preview, today)

        by_ticker = {item["ticker"]: item for item in preview}
        
        closed_lots = 0
        for e in data["entries"]:
            if e.get("source") != "import":
                closed_lots += self.reconcile_lots(e, by_ticker.get(e["ticker"]), today)

        import_by_ticker = {e["ticker"]: e for e in data["entries"] if e.get("source") == "import"}
        advised_tickers = {e["ticker"] for e in data["entries"] if e.get("source") != "import"}

        added = merged = 0
        for item in preview:
            if item["ticker"] in advised_tickers:
                continue
            
            existing_e = import_by_ticker.get(item["ticker"])
            if not item["boughtAt"]:
                item["boughtAt"] = item["currentPrice"]
            price_point = {"date": today, "price": item["currentPrice"] or item["boughtAt"]}
            if existing_e is not None:
                existing_e.update(status="bought", boughtAt=item["boughtAt"], units=item["units"])
                existing_e["tslSet"] = item.get("tslEnabled", existing_e.get("tslSet"))
                if item["sector"] is not None:
                    existing_e["sector"] = item["sector"]
                if not existing_e["priceHistory"]:
                    existing_e["priceHistory"].append(price_point)
                elif existing_e["priceHistory"][-1]["price"] == price_point["price"]:
                    pass
                elif existing_e["priceHistory"][-1]["date"] == today:
                    existing_e["priceHistory"][-1]["price"] = price_point["price"]
                else:
                    existing_e["priceHistory"].append(price_point)
                merged += 1
            else:
                data["entries"].append({
                    "ticker": item["ticker"], "name": item["name"],
                    "firstAdvised": item["firstOpen"], "source": "import",
                    "rating": None, "rsiAtAdvice": None,
                    "priceAtAdvice": item["boughtAt"],
                    "reason": "imported from eToro portfolio", "risk": None,
                    "sector": item["sector"], "buyBelow": None, "dropBelow": None,
                    "status": "bought", "boughtAt": item["boughtAt"], "soldAt": None,
                    "units": item["units"], "priceHistory": [price_point],
                    "tslSet": item.get("tslEnabled", False),
                })
                added += 1

        sector_by_ticker = {}
        if os.path.exists(self.instruments_cache):
            with open(self.instruments_cache) as f:
                for record in json.load(f).values():
                    if record.get("sector"):
                        sector_by_ticker[record["ticker"]] = record["sector"]
        backfilled = 0
        for entry in data["entries"]:
            if entry["ticker"] in sector_by_ticker:
                if entry.get("sector") != sector_by_ticker[entry["ticker"]]:
                    entry["sector"] = sector_by_ticker[entry["ticker"]]
                    backfilled += 1

        data["lastUpdated"] = today
        self.atomic_write(self.log_file, data)
        
        parts = []
        if added: parts.append(f"{added} new")
        if merged: parts.append(f"{merged} updated")
        if backfilled: parts.append(f"{backfilled} sectors backfilled")
        if closed_lots: parts.append(f"{closed_lots} auto-closed")
        
        summary = ", ".join(parts) if parts else "0 changes"
        logger.info(f"Merged: {summary}")


def main():
    if get_env("DEMO_MODE") == "1":
        logger.info("Demo Mode Enabled: Skipping eToro API import.")
        sys.exit(0)
        
    mode = sys.argv[1] if len(sys.argv) > 1 else "preview"
    app = EtoroImport()
    if mode == "preview":
        app.fetch_preview()
    elif mode == "merge":
        app.merge()
    else:
        sys.exit(f"Unknown mode: {mode}")

if __name__ == "__main__":
    main()
