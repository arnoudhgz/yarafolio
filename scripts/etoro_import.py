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
from __future__ import annotations

import json
import os
import sys
import uuid
import logging
from datetime import date, datetime, timedelta

import price_history
import nyse

BASE = "https://public-api.etoro.com/api/v1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
logger = logging.getLogger("etoro_import")
logger.setLevel(logging.INFO)
logger.handlers = []

fh = logging.FileHandler(os.path.join(ROOT, "logs", "app.log"))
fh.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(fh)

ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter('%(message)s'))
logger.addHandler(ch)


def get_env(key: str) -> str | None:
    v = os.environ.get(key)
    if v is not None:
        return v
    try:
        with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
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
        self.log_file = os.path.join(
            ROOT, "data", self.subdir, "advice-log.json")
        self.portfolio_file = os.path.join(
            ROOT, "data", self.subdir, "portfolio.json")
        self.instruments_cache = os.path.join(ROOT, "data", self.subdir, "custom_instruments.json")
        self.history_file = os.path.join(ROOT, "data", self.subdir, "history.json")
        self.preview_file = os.path.join(
            ROOT, "tmp", "etoro-import-preview.json")

    def credentials(self) -> dict:
        env_vars = {}
        env_file = os.path.join(ROOT, ".env")
        try:
            with open(env_file, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.removeprefix("export ").strip()
                    env_vars[key] = value.strip().strip("\"'")
        except OSError:
            pass

        for k, v in os.environ.items():
            env_vars[k] = v

        api_key = env_vars.get("ETORO_API_KEY")
        if not api_key:
            raise RuntimeError(f"Missing ETORO_API_KEY (checked environment and {env_file})")

        suffix = env_vars.get("ETORO_SUFFIX", "")
        user_keys = []
        if suffix:
            k = f"ETORO_USER_KEY_{suffix}"
            if k in env_vars:
                user_keys.append(env_vars[k])
        else:
            for k, v in sorted(env_vars.items()):
                if k.startswith("ETORO_USER_KEY"):
                    if v not in user_keys:
                        user_keys.append(v)

        if not user_keys:
            raise RuntimeError(f"Missing ETORO_USER_KEY (checked environment and {env_file})")

        import urllib.request
        import urllib.error

        for uk in user_keys:
            creds = {"ETORO_API_KEY": api_key, "ETORO_USER_KEY": uk}
            req = urllib.request.Request(BASE + "/trading/info/portfolio", headers={
                "x-api-key": api_key,
                "x-user-key": uk,
                "x-request-id": str(uuid.uuid4()),
                "Accept": "application/json",
                "User-Agent": "curl/8.7.1",
            })
            try:
                with urllib.request.urlopen(req, timeout=15) as res:
                    self.cached_portfolio = json.loads(res.read())
                    return creds
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    continue
                else:
                    sys.exit(f"eToro API Error ({exc.code}): {exc.reason}")
            except (urllib.error.URLError, TimeoutError) as exc:
                sys.exit(f"eToro API Connection Error: {exc} (timed out or network down)")

        sys.exit("eToro Authentication Failed (401/403): Exhausted all available ETORO_USER_KEYs in .env")

    def get(self, path, creds):
        import urllib.request
        import urllib.error
        req = urllib.request.Request(BASE + path, headers={
            "x-api-key": creds["ETORO_API_KEY"],
            "x-user-key": creds["ETORO_USER_KEY"],
            "x-request-id": str(uuid.uuid4()),
            "Accept": "application/json",
            "User-Agent": "curl/8.7.1",
        })
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                sys.exit(
                    f"eToro Authentication Failed ({exc.code}): Please check your ETORO_API_KEY and ETORO_USER_KEY in .env")
            else:
                sys.exit(f"eToro API Error ({exc.code}): {exc.reason}")
        except (urllib.error.URLError, TimeoutError) as exc:
            sys.exit(f"eToro API Connection Error: {exc} (timed out or network down)")

    def chunked(self, items, size=50):
        for i in range(0, len(items), size):
            yield items[i:i + size]

    def atomic_write(self, path, payload):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        os.replace(tmp, path)

    def fetch_industries(self, creds):
        try:
            rows = self.get(
                "/market-data/stocks-industries",
                creds)["stocksIndustries"]
            return {r["industryID"]: r["industryName"] for r in rows}
        except Exception as exc:
            logger.warning(
                f"warning: industries fetch failed ({exc}), sectors left unknown")
            return None

    def sector_for(self, meta_record: dict, industries: dict) -> str:
        if not meta_record or industries is None:
            return None
        if meta_record.get("instrumentTypeID") != 5:
            return "ETF / Other"
        return industries.get(
            meta_record.get("stocksIndustryID"),
            "ETF / Other")

    def fetch_preview(self):
        creds = self.credentials()
        if hasattr(self, "cached_portfolio"):
            portfolio = self.cached_portfolio
        else:
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
            for m in self.get(
                f"/market-data/instruments?instrumentIds={param}",
                    creds)["instrumentDisplayDatas"]:
                meta[m["instrumentID"]] = m
            for r in self.get(
                f"/market-data/instruments/rates?instrumentIds={param}",
                    creds)["rates"]:
                rates[r["instrumentID"]] = r

        cache = {}
        if os.path.exists(self.instruments_cache):
            with open(self.instruments_cache, encoding="utf-8") as f:
                cache = json.load(f)

        entries = []
        for iid in ids:
            plist = by_instrument[iid]
            units = sum(p["units"] for p in plist)
            avg_open = sum(p["units"] * p["openRate"] for p in plist) / units
            invested = sum(p["initialAmountInDollars"] for p in plist)
            first_open = min(p["openDateTime"] for p in plist)[:10]
            m = meta.get(iid, {})
            rate = rates.get(iid, {})
            current = rate.get("bid") or rate.get("lastExecution")
            if current:
                pl_dollar = round(sum(
                    p["units"] * (current - p["openRate"]) if p.get("isBuy", True) 
                    else p["units"] * (p["openRate"] - current)
                    for p in plist
                ), 2)
            else:
                pl_dollar = None
            pl_pct = round(pl_dollar / invested * 100,
                           2) if pl_dollar is not None and invested else None
            
            cached = cache.get(str(iid), {})
            cached_sector = cached.get("sector")
            mapped_ticker = cached.get("mappedTicker")
            sector_val = cached_sector if cached_sector else self.sector_for(m, industries)

            entries.append({
                "ticker": mapped_ticker or m.get("symbolFull", f"ID{iid}"),
                "name": m.get("instrumentDisplayName", ""),
                "instrumentID": iid,
                "sector": sector_val,
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
                    "openDateTime": p["openDateTime"],
                    "openRate": round(p["openRate"], 4),
                    "units": round(p["units"], 6),
                    "invested": round(p["initialAmountInDollars"], 2),
                    "tslEnabled": bool(p.get("isTslEnabled")),
                    "isBuy": p.get("isBuy", True),
                } for p in plist],
            })

        self.atomic_write(self.preview_file, entries)

        base_cache = {}
        base_instruments = os.path.join(ROOT, "data", "instruments.json")
        if os.path.exists(base_instruments):
            with open(base_instruments, encoding="utf-8") as f:
                base_cache = json.load(f)
                
        custom_cache = {}
        if os.path.exists(self.instruments_cache):
            with open(self.instruments_cache, encoding="utf-8") as f:
                custom_cache = json.load(f)
                
        full_cache = {**base_cache, **custom_cache}
        
        for iid, m in meta.items():
            record = full_cache.get(str(iid), {})
            record["ticker"] = m["symbolFull"]
            record["name"] = m["instrumentDisplayName"]
            if record["ticker"].endswith(".US") and "mappedTicker" not in record:
                record["mappedTicker"] = record["ticker"].replace(".US", "")
            if "sector" not in record:
                sector = self.sector_for(m, industries)
                if sector is not None:
                    record["sector"] = sector
            
            base_record = base_cache.get(str(iid))
            if base_record == record:
                custom_cache.pop(str(iid), None)
            else:
                custom_cache[str(iid)] = record
                
        self.atomic_write(self.instruments_cache, custom_cache)

        logger.info(f"{len(entries)} instruments, {len(positions)} positions, "
                    f"${sum(e['invested'] for e in entries):,.2f} invested")
        logger.info(f"Preview written to {self.preview_file}")

    def write_portfolio(self, preview, today):
        self.atomic_write(self.portfolio_file, {
            "lastUpdated": nyse.nyse_now().isoformat("T", "minutes"),
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

    def reconcile_lots(self, entry, item, today, claimed_lots=None, history_by_pid=None):
        if claimed_lots is None:
            claimed_lots = set()
        if history_by_pid is None:
            history_by_pid = {}
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
        have = {lot["positionID"]: lot for lot in lots}
        
        # Pre-claim lots we already own
        for pid in have:
            claimed_lots.add(pid)
            
        for pid, lot in live.items():
            if pid not in have:
                if pid in claimed_lots:
                    continue
                lots.append({"positionID": pid,
                             "openDate": lot["openDate"],
                             "openDateTime": lot.get("openDateTime"),
                             "openRate": lot["openRate"],
                             "units": lot["units"],
                             "lastPrice": current or lot["openRate"],
                             "tslEnabled": bool(lot.get("tslEnabled")),
                             "isBuy": lot.get("isBuy", True),
                             "soldAt": None,
                             "exitEstimated": False})
                claimed_lots.add(pid)
            elif have[pid].get("soldAt") is None:
                have[pid]["tslEnabled"] = bool(lot.get("tslEnabled"))
                if not have[pid].get("openDateTime") and lot.get("openDateTime"):
                    have[pid]["openDateTime"] = lot["openDateTime"]
                if current:
                    have[pid]["lastPrice"] = current
        closed = 0
        for lot in lots:
            if lot.get("soldAt") is None and lot["positionID"] not in live:
                pid = lot["positionID"]
                h_lot = history_by_pid.get(pid) or history_by_pid.get(int(pid)) if pid else None
                if h_lot and h_lot.get("closeRate"):
                    lot["soldAt"] = h_lot["closeRate"]
                    lot["exitEstimated"] = False
                    # e.g. "2026-08-20T14:30:00Z" -> "2026-08-20"
                    lot["closedDate"] = h_lot.get("closeTimestamp", today)[:10]
                    if h_lot.get("netProfit") is not None:
                        lot["netProfit"] = h_lot["netProfit"]
                else:
                    lot["soldAt"] = lot.get("lastPrice") or lot["openRate"]
                    lot["exitEstimated"] = True
                    lot["closedDate"] = today
                closed += 1
        if closed:
            entry.setdefault("notes", []).append({
                "date": today,
                "text": f"Auto-closed {closed} lot(s) gone from eToro on {today} (resolved exact prices via API history where available)."})
        if lots:
            self.rollup_entry(entry, current)
        return closed

    def rollup_entry(self, entry: dict, current_price: float | None) -> None:
        lots = entry["lots"]
        open_lots = [lot for lot in lots if lot.get("soldAt") is None]
        total_units = sum(lot["units"] for lot in lots) or 1
        entry["boughtAt"] = round(sum(lot["openRate"] * lot["units"]
                                  for lot in lots) / total_units, 4)
        if open_lots:
            entry["status"] = "bought"
            entry["units"] = round(sum(lot["units"] for lot in open_lots), 6)
            entry["soldAt"] = None
            entry["tslSet"] = any(lot.get("tslEnabled") for lot in open_lots)
            entry.pop("exitEstimated", None)
        else:
            entry["status"] = "sold"
            entry["units"] = round(sum(lot["units"] for lot in lots), 6)
            entry["soldAt"] = round(
                sum((lot.get("soldAt") or 0) * lot["units"] for lot in lots) / total_units, 4)
            entry["exitEstimated"] = any(lot.get("exitEstimated") for lot in lots)
        if current_price:
            hist = entry.setdefault("priceHistory", [])
            price_history.push_price_point(hist, current_price, now=nyse.nyse_now())

    def fetch_trading_history(self, min_date):
        try:
            creds = self.credentials()
            url = f"/trading/info/trade/history?pageSize=200&minDate={min_date}"
            res = self.get(url, creds)
            if isinstance(res, dict):
                return res.get("history", [])
            elif isinstance(res, list):
                return res
            return []
        except Exception as e:
            logger.warning(f"Could not fetch trading history: {e}")
            return []

    def merge(self):
        with open(self.preview_file, encoding="utf-8") as f:
            preview = json.load(f)
        with open(self.log_file, encoding="utf-8") as f:
            data = json.load(f)

        known_sectors = {e["ticker"]: e["sector"] for e in data["entries"] if e.get("sector")}
        for item in preview:
            if item["ticker"] in known_sectors:
                item["sector"] = known_sectors[item["ticker"]]

        today = nyse.nyse_today().isoformat()
        self.write_portfolio(preview, today)

        by_ticker = {item["ticker"]: item for item in preview}

        # Build instrument ID mapping
        inst_by_id = {}
        for path in [os.path.join(ROOT, "data", "instruments.json"), self.instruments_cache]:
            if os.path.exists(path):
                try:
                    with open(path, encoding="utf-8") as f:
                        for k, v in json.load(f).items():
                            inst_by_id[int(k)] = v
                            inst_by_id[str(k)] = v
                except:
                    pass

        # Fetch recent trading history to match exact closed prices
        three_months_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        history = self.fetch_trading_history(three_months_ago)
        history_by_pid = {t["positionId"]: t for t in history} if history else {}

        # Accumulate history
        if history:
            existing_history = []
            if os.path.exists(self.history_file):
                try:
                    with open(self.history_file, encoding="utf-8") as f:
                        existing_history = json.load(f)
                except:
                    pass
            existing_by_pid = {t["positionId"]: t for t in existing_history}
            
            for t in history:
                pid = t["positionId"]
                if pid not in existing_by_pid:
                    iid = t.get("instrumentId")
                    if iid and iid in inst_by_id:
                        t["ticker"] = inst_by_id[iid].get("ticker", "")
                        t["sector"] = inst_by_id[iid].get("sector", "")
                    existing_by_pid[pid] = t
                    
            merged_history = list(existing_by_pid.values())
            # Sort descending by close timestamp
            merged_history.sort(key=lambda x: x.get("closeTimestamp", ""), reverse=True)
            self.atomic_write(self.history_file, merged_history)

        closed_lots = 0
        claimed_lots = set()
        
        advised_entries = [e for e in data["entries"] if e.get("source") != "import"]
        advised_entries.sort(key=lambda x: x.get("firstAdvised", ""), reverse=True)
        
        for e in advised_entries:
            closed_lots += self.reconcile_lots(e, by_ticker.get(e["ticker"]), today, claimed_lots, history_by_pid)

        import_by_ticker = {
            e["ticker"]: e for e in data["entries"] if e.get("source") == "import"}
        advised_tickers = {e["ticker"]
                           for e in data["entries"] if e.get("source") != "import"}

        added = merged = 0
        for item in preview:
            if item["ticker"] in advised_tickers:
                continue

            existing_e = import_by_ticker.get(item["ticker"])
            if not item["boughtAt"]:
                item["boughtAt"] = item["currentPrice"]
            price_point = {
                "date": today,
                "price": item["currentPrice"] or item["boughtAt"]}
            if existing_e is not None:
                import copy
                original = copy.deepcopy(existing_e)

                existing_e.update(
                    status="bought",
                    boughtAt=item["boughtAt"],
                    units=item["units"])
                existing_e["tslSet"] = item.get(
                    "tslEnabled", existing_e.get("tslSet"))
                if item["sector"] is not None and not existing_e.get("sector"):
                    existing_e["sector"] = item["sector"]
                if not existing_e["priceHistory"]:
                    existing_e["priceHistory"].append(price_point)
                elif existing_e["priceHistory"][-1]["price"] == price_point["price"]:
                    pass
                elif existing_e["priceHistory"][-1]["date"] == today:
                    existing_e["priceHistory"][-1]["price"] = price_point["price"]
                else:
                    existing_e["priceHistory"].append(price_point)

                if original != existing_e:
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

        import_tickers_in_preview = {item["ticker"] for item in preview}
        for ticker, existing_e in import_by_ticker.items():
            if ticker not in import_tickers_in_preview and existing_e.get("status") == "bought":
                existing_e["status"] = "sold"
                history = existing_e.get("priceHistory", [])
                existing_e["soldAt"] = history[-1]["price"] if history else existing_e.get("boughtAt")
                merged += 1

        sector_by_ticker = {}
        base_instruments = os.path.join(ROOT, "data", "instruments.json")
        if os.path.exists(base_instruments):
            with open(base_instruments, encoding="utf-8") as f:
                for record in json.load(f).values():
                    if record.get("sector"):
                        sector_by_ticker[record["ticker"]] = record["sector"]
        if os.path.exists(self.instruments_cache):
            with open(self.instruments_cache, encoding="utf-8") as f:
                for record in json.load(f).values():
                    if record.get("sector"):
                        sector_by_ticker[record["ticker"]] = record["sector"]
        backfilled = 0
        for entry in data["entries"]:
            if entry["ticker"] in sector_by_ticker:
                if not entry.get("sector"):
                    entry["sector"] = sector_by_ticker[entry["ticker"]]
                    backfilled += 1

        data["lastUpdated"] = nyse.nyse_now().isoformat("T", "minutes")
        self.atomic_write(self.log_file, data)

        parts = []
        if added:
            parts.append(f"{added} new")
        if merged:
            parts.append(f"{merged} updated")
        if backfilled:
            parts.append(f"{backfilled} sectors backfilled")
        if closed_lots:
            parts.append(f"{closed_lots} auto-closed")

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
