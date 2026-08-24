#!/usr/bin/env python3
"""Mutate and query data/advice-log.json from the command line.

All deterministic log work goes through this CLI so skills don't hand-edit JSON.
Every mutating command bumps lastUpdated.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import logging
from datetime import date, datetime

import price_history
import entries
import nyse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
logger = logging.getLogger("advice_log")
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


class AdviceLog:
    SECTORS = (
        "Materials", "Industrials", "Communication Services", "Energy", "Real Estate",
        "Consumer Staples", "Consumer Discretionary",
        "Financials",
        "Healthcare",
        "Consumer Discretionary",
        "Technology",
        "Utilities",
        "ETF / Other")
    NEW_PICK_SOURCES = ("oversold", "diversify", "manual", "momentum", "earnings", "insider", "market-rotation")

    def __init__(self):
        is_demo = get_env("DEMO_MODE") == "1"
        self.subdir = "sample" if is_demo else "private"
        self.log_file = os.path.join(
            ROOT, "data", self.subdir, "advice-log.json")
        self.portfolio_file = os.path.join(
            ROOT, "data", self.subdir, "portfolio.json")

    def load_log(self) -> dict:
        with open(self.log_file, encoding="utf-8") as f:
            return entries.normalize_entries(json.load(f))

    def save_log(self, data: dict) -> None:
        data["lastUpdated"] = nyse.nyse_now().isoformat("T", "minutes")
        tmp = self.log_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp, self.log_file)

    def find(self, data: dict, ticker: str) -> dict | None:
        for e in data["entries"]:
            if e.get("ticker") == ticker and e.get("status") in ("watching", "bought"):
                return e
        return None

    def get_entry(self, data: dict, ticker: str) -> dict | None:
        ticker = ticker.upper()
        for e in data["entries"]:
            if (e.get("ticker") or "").upper() == ticker and e.get("status") in ("watching", "bought"):
                return e
        for e in data["entries"]:
            if (e.get("ticker") or "").upper() == ticker:
                return e
        return None

    def find_by_id(self, data, id):
        for e in data["entries"]:
            if e.get("id") == id:
                return e
        return None

    def require_by_id(self, data, id):
        e = self.find_by_id(data, id)
        if e is None:
            sys.exit(f"{id} is not tracked")
        return e

    def require(self, data, ticker):
        e = self.find(data, ticker)
        if e is None:
            sys.exit(f"{ticker} is not tracked")
        return e

    def latest_price(self, e: dict) -> float | None:
        hist = e.get("priceHistory") or []
        return hist[-1]["price"] if hist else e.get("priceAtAdvice")

    def push_history(self, e: dict, price: float) -> None:
        hist = e.setdefault("priceHistory", [])
        price_history.push_price_point(hist, price, now=nyse.nyse_now())

    def push_note(self, e: dict, text: str) -> None:
        today_str = nyse.nyse_today().isoformat()
        notes = e.setdefault("notes", [])
        if not any(n.get("date") == today_str and n.get("text") == text for n in notes):
            notes.append({"date": today_str, "text": text})

    def replace_advice_note(self, e: dict, text: str) -> None:
        """One 'Advised (...)' note per ticker per day.

        Re-running add-pick to reword a thesis used to stack a second note on top
        of the first, so the drill-down modal showed both the draft and the edit.
        """
        today_str = nyse.nyse_today().isoformat()
        notes = e.setdefault("notes", [])
        e["notes"] = [n for n in notes
                      if not (n.get("date") == today_str
                              and str(n.get("text", "")).startswith("Advised ("))]
        self.push_note(e, text)

    def cmd_add_pick(self, args: argparse.Namespace):
        data = self.load_log()
        today = nyse.nyse_today().isoformat()

        def parse_float(val):
            if val is None or str(val).lower() in ("n/a", "none", "null", ""):
                return None
            try:
                return float(val)
            except ValueError:
                sys.exit(f"Invalid float value: {val}")

        rsi_val = parse_float(args.rsi)
        buy_below_val = parse_float(args.buy_below)
        drop_below_val = parse_float(args.drop_below)
        drop_above_val = parse_float(args.drop_above)

        e = None
        for x in data["entries"]:
            if x["ticker"] == args.ticker and x.get(
                    "status") in ("watching", "bought") and x.get("source") != "import":
                e = x
                break

        if e is None:
            for x in data["entries"]:
                if x["ticker"] == args.ticker and x.get("status") in ("blacklisted", "avoid"):
                    sys.exit(f"Addition aborted: {args.ticker} is already marked as {x.get('status')} in the log.")
            
            missing = []
            if args.source is None: missing.append("--source")
            if args.rating is None: missing.append("--rating")
            if args.sector is None: missing.append("--sector")
            if args.buy_below is None: missing.append("--buy-below")
            if args.drop_below is None: missing.append("--drop-below")
            if args.name is None: missing.append("--name")
            if args.reason is None: missing.append("--reason")
            if args.risk is None: missing.append("--risk")
            if args.open_note is None: missing.append("--open-note")
            if args.rsi is None: missing.append("--rsi")
            if args.drop_above is None: missing.append("--drop-above")

            if missing:
                sys.exit(f"{args.ticker} is new: The following parameters are strictly mandatory: {', '.join(missing)}. Use 'N/A' if not applicable.")

            count = sum(1 for x in data["entries"]
                        if x["ticker"] == args.ticker) + 1
            e = {
                "id": f"{args.ticker}-{count:04d}",
                "ticker": args.ticker,
                "name": args.name or "",
                "firstAdvised": today,
                "source": args.source,
                "rating": None,
                "rsiAtAdvice": None,
                "priceAtAdvice": args.price,
                "reason": None,
                "risk": None,
                "openNote": None,
                "sector": None,
                "buyBelow": None,
                "dropBelow": None,
                "dropAbove": None,
                "status": "watching",
                "boughtAt": None,
                "soldAt": None,
                "units": None,
                "priceHistory": [],
                "notes": [],
            }
            data["entries"].append(e)
            action = "added"
        else:
            action = "updated"
        # Track each advice (date + price) so the Positions view can show which
        # advice prompted each lot, and at what price (matched by buy date).
        e.pop("adviceDates", None)  # superseded by adviceEvents
        events = e.get("adviceEvents")
        if events is None:
            events = ([{"date": e["firstAdvised"], "price": e.get("priceAtAdvice")}]
                      if e.get("firstAdvised") else [])
        if not any(ev.get("date") == today for ev in events):
            events.append({"date": today, "price": args.price})
        events.sort(key=lambda ev: ev["date"])
        e["adviceEvents"] = events
        self.push_history(e, args.price)
        for field, arg_raw, value in (
            ("rating", args.rating, args.rating),
            ("rsiAtAdvice", args.rsi, rsi_val),
            ("sector", args.sector, args.sector),
            ("buyBelow", args.buy_below, buy_below_val),
            ("dropBelow", args.drop_below, drop_below_val),
            ("dropAbove", args.drop_above, drop_above_val),
            ("name", args.name, args.name),
            ("source", args.source, args.source),
            ("reason", args.reason, args.reason),
            ("risk", args.risk, args.risk),
            ("openNote", args.open_note, args.open_note)
        ):
            if arg_raw is not None:
                e[field] = value
        if args.reason:
            advised = f"Advised ({args.source or e.get('source')}): {args.reason}"
            self.replace_advice_note(e, advised)
        if args.note:
            self.push_note(e, args.note)
        self.save_log(data)
        logger.info(f"{action} {args.ticker} ({e['status']}) @ ${args.price}")

    def cmd_add_note(self, args: argparse.Namespace):
        data = self.load_log()
        e = self.require(data, args.ticker)
        self.push_note(e, args.text)
        self.save_log(data)
        logger.info(f"{args.ticker}: note added ({len(e['notes'])} total)")

    def _append_to_md(self, basename: str, title_date: str, content: str):
        subdir = "sample" if os.environ.get("DEMO_MODE") == "1" else "private"
        md_file = os.path.join(ROOT, "data", subdir, basename)
        
        entry = f"# {title_date}\n\n{content.strip()}\n"
        
        if os.path.exists(md_file):
            with open(md_file, "r", encoding="utf-8") as f:
                existing = f.read().strip()
            
            if existing:
                blocks = existing.split("\n---\n\n")
                blocks.append(entry)
                # Keep last 10 entries max
                if len(blocks) > 10:
                    blocks = blocks[-10:]
                new_content = "\n---\n\n".join(blocks)
            else:
                new_content = entry
        else:
            new_content = entry
            
        with open(md_file, "w", encoding="utf-8") as f:
            f.write(new_content)
        
        # We also need to bump lastUpdated on the main log to trigger autosync/refresh
        data = self.load_log()
        self.save_log(data)

    def cmd_add_eod(self, args: argparse.Namespace):
        date_str = nyse.nyse_now().isoformat("T", "minutes")
        self._append_to_md("eod.md", date_str, args.summary)
        logger.info("EOD report added.")

    def cmd_add_news_summary(self, args: argparse.Namespace):
        date_str = nyse.nyse_now().isoformat("T", "seconds")
        self._append_to_md("news.md", date_str, args.summary)
        logger.info("News summary added.")

    def cmd_touch(self, args: argparse.Namespace):
        data = self.load_log()
        e = self.require(data, args.ticker)
        self.push_history(e, args.price)
        self.save_log(data)
        logger.info(f"{args.ticker}: price point ${args.price} added")

    def cmd_touch_many(self, args: argparse.Namespace):
        try:
            prices = json.load(sys.stdin)
        except json.JSONDecodeError as exc:
            sys.exit(f"touch-many expects a JSON map on stdin: {exc}")
        if not isinstance(prices, dict):
            sys.exit('touch-many expects a JSON object like {"AAPL": 312.7}')
        data = self.load_log()
        touched, skipped = [], []
        for ticker, payload in prices.items():
            if isinstance(payload, (int, float)):
                price = payload
                earnings_date = None
            elif isinstance(payload, dict) and "price" in payload:
                price = payload["price"]
                earnings_date = payload.get("earningsDate")
            else:
                skipped.append(ticker)
                continue

            found_any = False
            for e in data["entries"]:
                if e["ticker"] == ticker and e["status"] in (
                        "watching", "bought"):
                    self.push_history(e, float(price))
                    if earnings_date and earnings_date not in ("", "-"):
                        e["earningsDate"] = earnings_date
                    found_any = True

            if found_any:
                touched.append(ticker)
            else:
                skipped.append(ticker)

        if touched:
            self.save_log(data)
        msg = f"touched {len(touched)}: {', '.join(touched) or '-'}"
        if skipped:
            msg += f" (skipped untracked: {', '.join(skipped)})"
        logger.info(msg)

    def cmd_open_profits(self, args: argparse.Namespace):
        data = self.load_log()
        green = []
        for e in data.get("entries", []):
            if e.get("status") == "bought":
                lots = e.get("lots", [])
                if not lots:
                    continue
                open_lots = [l for l in lots if not l.get("exitEstimated")]
                if not open_lots:
                    continue
                history = e.get("priceHistory", [])
                current_price = history[-1].get("price", 0) if history else 0
                if current_price <= 0:
                    continue
                total_invested = sum(l.get("openRate", 0) * l.get("units", 0) for l in open_lots)
                total_value = sum(current_price * l.get("units", 0) for l in open_lots)
                if total_invested > 0:
                    pl_pct = ((total_value - total_invested) / total_invested) * 100
                    if pl_pct > 0:
                        green.append((e.get("ticker"), pl_pct, current_price, e.get("sector", "?")))
        if not green:
            logger.info("No open positions in profit.")
            return
        logger.info("Open positions currently in profit:")
        for ticker, pl, p, sec in sorted(green, key=lambda x: x[1], reverse=True):
            logger.info(f"- {ticker}: +{pl:.2f}% (Price: {p}, Sector: {sec})")

    def cmd_set_status(self, args: argparse.Namespace):
        data = self.load_log()
        e = self.require(data, args.ticker)
        price = args.price if args.price is not None else self.latest_price(e)
        if args.price is not None:
            self.push_history(e, args.price)
        if args.status == "bought":
            e["boughtAt"] = price
        elif args.status == "sold":
            e["soldAt"] = price
            e.pop("exitEstimated", None)
        elif args.status == "dropped":
            e["droppedDate"] = nyse.nyse_today().isoformat()
        elif args.status == "blacklisted":
            e["droppedDate"] = nyse.nyse_today().isoformat()
            if hasattr(args, "reason") and args.reason:
                e["blacklistReason"] = args.reason
        e["status"] = args.status
        self.push_note(e, f"Status changed to {args.status} @ ${price}")
        self.save_log(data)
        logger.info(f"{args.ticker}: {args.status} @ ${price}")

    def cmd_set_tsl(self, args: argparse.Namespace):
        data = self.load_log()
        e = self.require(data, args.ticker)
        e["tslSet"] = not args.off
        self.push_note(e, "Trailing stop loss removed on eToro" if args.off
                       else "Trailing stop loss set on eToro")
        self.save_log(data)
        logger.info(f"{args.ticker}: tslSet = {e['tslSet']}")

    def cmd_checkin_candidates(self, args: argparse.Namespace):
        data = self.load_log()
        today = nyse.nyse_today()
        rows = []
        for e in data["entries"]:
            est_lots = [lot for lot in e.get("lots", []) if lot.get("exitEstimated")]
            if est_lots:
                rows.append(
                    (0, 0.0, f"{e['ticker']}: {len(est_lots)} lot(s) auto-closed at estimated exit, "
                     f"confirm the real price (dashboard Confirm, or set-status sold --price X)"))
            if e.get("status") == "watching":
                price = self.latest_price(e)
                if e.get(
                        "dropAbove") and price is not None and price >= e["dropAbove"]:
                    rows.append(
                        (0, -price, f"{e['ticker']}: now ${price} >= drop-above ${e['dropAbove']}, "
                         f"the oversold bounce already ran - drop it?"))
                elif e.get("firstAdvised"):
                    age = (
                        today -
                        datetime.strptime(
                            e["firstAdvised"],
                            "%Y-%m-%d").date()).days
                    if age > 3:
                        rows.append(
                            (1, -age, f"{e['ticker']}: watching {age}d, advised @ ${e.get('priceAtAdvice')}, "
                             f"now ${self.latest_price(e)}"))
            elif e.get("status") == "bought" and e.get("boughtAt") and not e.get("tslSet"):
                pct = (self.latest_price(e) -
                       e["boughtAt"]) / e["boughtAt"] * 100
                if pct >= 5:
                    rows.append(
                        (0, -pct, f"{e['ticker']}: bought @ ${e['boughtAt']}, now ${self.latest_price(e)} "
                         f"({pct:+.1f}%) - trailing stop territory"))
        if not rows:
            logger.info("No check-in candidates.")
            return
        for _, _, line in sorted(rows):
            logger.info(line)

    def load_portfolio(self) -> dict:
        if not os.path.exists(self.portfolio_file):
            sys.exit("data/portfolio.json missing: run the eToro import first")
        with open(self.portfolio_file, encoding="utf-8") as f:
            return json.load(f)

    def cmd_compare(self, args: argparse.Namespace):
        data = self.load_log()
        held = {h["ticker"]: h for h in self.load_portfolio()["holdings"]}
        hits = [(e, held[e["ticker"]]) for e in data["entries"]
                if e.get("source") != "import" and e["ticker"] in held]
        if not hits:
            logger.info("No advised picks currently held.")
            return
        for e, h in hits:
            pl = f"{h['plPct']:+.1f}%" if h.get("plPct") is not None else "?"
            logger.info(
                f"{e['ticker']}: advised @ ${e['priceAtAdvice']} ({e['firstAdvised']}), "
                f"entry ${h['avgOpen']}, now ${h['currentPrice']} ({pl})")

    def cmd_sector_gaps(self, args: argparse.Namespace):
        portfolio = self.load_portfolio()
        total = portfolio.get("totalInvested") or sum(
            h["invested"] for h in portfolio["holdings"])
        by_sector = {}
        for h in portfolio["holdings"]:
            by_sector[h.get("sector") or "ETF / Other"] = \
                by_sector.get(h.get("sector") or "ETF / Other", 0.0) + h["invested"]
        logger.info(
            f"Invested: ${total:,.2f} across {len(portfolio['holdings'])} holdings\n")
        for sector in self.SECTORS:
            invested = by_sector.get(sector, 0.0)
            pct = invested / total * 100 if total else 0.0
            logger.info(f"{sector:18} ${invested:>10,.2f}  {pct:5.1f}%")
        unknown = by_sector.get("Unknown", 0.0)
        if unknown:
            logger.info(
                f"{'Unknown':18} ${unknown:>10,.2f}  {unknown / total * 100:5.1f}%")
        under = [s for s in self.SECTORS if s != "ETF / Other"
                 and (by_sector.get(s, 0.0) / total * 100 if total else 0.0) < 5.0]
        logger.info(
            f"\nUnderweight (<5% of invested): {', '.join(under) if under else 'none'}")


    def cmd_get_entry(self, args: argparse.Namespace):
        data = self.load_log()
        entry = self.get_entry(data, args.ticker)
        if entry is None:
            if args.json:
                logger.info("null")
            else:
                logger.info(f"{args.ticker.upper()} is not tracked")
            return
        if args.json:
            logger.info(json.dumps(entry))
            return
        logger.info(
            f"{entry.get('ticker')} ({entry.get('status')}): advised @ "
            f"${entry.get('priceAtAdvice')} on {entry.get('firstAdvised')}, "
            f"now ${self.latest_price(entry)}, sector {entry.get('sector')}")
        if entry.get("reason"):
            logger.info(f"  thesis: {entry['reason']}")
        if entry.get("risk"):
            logger.info(f"  risk:   {entry['risk']}")

    def cmd_remove(self, args: argparse.Namespace):
        data = self.load_log()
        e = self.require_by_id(data, args.id)
        lots = e.get("lots") or []
        if lots and not args.force:
            sys.exit(
                f"{args.id} ({e.get('ticker')}) has {len(lots)} eToro lot(s); "
                "refusing to remove a tracked position without --force")
        e["status"] = "removed"
        self.save_log(data)
        logger.info(f"marked as removed {args.id} ({e.get('ticker')})")


    def cmd_prune_text(self, args: argparse.Namespace):
        data = self.load_log()
        pruned_count = 0
        for e in data.get("entries", []):
            if e.get("status") in ("sold", "blacklisted"):
                pruned = False
                if e.get("reason"):
                    e["reason"] = None
                    pruned = True
                if e.get("risk"):
                    e["risk"] = None
                    pruned = True
                if e.get("notes") and len(e["notes"]) > 0:
                    e["notes"] = []
                    pruned = True
                
                if pruned:
                    pruned_count += 1
        
        if pruned_count > 0:
            self.save_log(data)
            logger.info(f"Pruned text fields (reason, risk, notes) from {pruned_count} sold/blacklisted entries.")
        else:
            logger.info("No sold/blacklisted entries needed text pruning.")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    app = AdviceLog()

    p = sub.add_parser("add-pick", help="upsert an advice pick")
    p.add_argument("ticker")
    p.add_argument("--price", type=float, required=True)
    p.add_argument("--source", choices=app.NEW_PICK_SOURCES)
    p.add_argument("--rating", choices=["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"])
    p.add_argument("--rsi", type=str)
    p.add_argument("--sector", choices=app.SECTORS)
    p.add_argument("--buy-below", type=str)
    p.add_argument("--drop-below", type=str)
    p.add_argument(
        "--drop-above",
        type=str,
        help="ceiling: above this the oversold bounce already ran, drop the watch")
    p.add_argument("--name")
    p.add_argument("--reason")
    p.add_argument("--risk")
    p.add_argument("--open-note")
    p.add_argument(
        "--note",
        help="dated commentary for the notes history (news, what happened)")
    p.set_defaults(func=app.cmd_add_pick)

    p = sub.add_parser("touch", help="append a price point")
    p.add_argument("ticker")
    p.add_argument("--price", type=float, required=True)
    p.set_defaults(func=app.cmd_touch)

    p = sub.add_parser(
        "touch-many",
        help='batch price update from a {"TICKER": price} JSON map on stdin')
    p.set_defaults(func=app.cmd_touch_many)

    p = sub.add_parser("open-profits", help="list open advice positions currently in profit")
    p.set_defaults(func=app.cmd_open_profits)

    p = sub.add_parser(
        "add-note",
        help="append dated commentary to a tracked ticker")
    p.add_argument("ticker")
    p.add_argument("--text", required=True)
    p.set_defaults(func=app.cmd_add_note)

    peod = sub.add_parser("add-eod", help="append a daily EOD report summary")
    peod.add_argument("--summary", required=True)
    peod.set_defaults(func=app.cmd_add_eod)

    pnews = sub.add_parser(
        "add-news-summary",
        help="append an AI news summary")
    pnews.add_argument("--summary", required=True)
    pnews.set_defaults(func=app.cmd_add_news_summary)

    p = sub.add_parser("set-status", help="change entry status")
    p.add_argument("ticker")
    p.add_argument("status", choices=("watching", "bought", "sold", "dropped", "blacklisted"))
    p.add_argument("--price", type=float)
    p.add_argument("--reason", help="Reason for blacklisting (e.g. paused, not listed)")
    p.set_defaults(func=app.cmd_set_status)

    p = sub.add_parser(
        "set-tsl",
        help="mark trailing stop loss active on eToro")
    p.add_argument("ticker")
    p.add_argument("--off", action="store_true")
    p.set_defaults(func=app.cmd_set_tsl)

    p = sub.add_parser(
        "checkin-candidates",
        help="tickers due for the keep/drop check-in")
    p.set_defaults(func=app.cmd_checkin_candidates)

    p = sub.add_parser(
        "compare",
        help="advised picks vs current eToro holdings")
    p.set_defaults(func=app.cmd_compare)

    p = sub.add_parser(
        "sector-gaps",
        help="portfolio sector split + underweight sectors")
    p.set_defaults(func=app.cmd_sector_gaps)

    p = sub.add_parser(
        "get-entry",
        help="read a single tracked entry (any status) by ticker")
    p.add_argument("ticker")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=app.cmd_get_entry)

    p = sub.add_parser(
        "remove",
        help="delete an entry by id (e.g. a duplicate); guarded for entries with lots")
    p.add_argument("id")
    p.add_argument("--force", action="store_true",
                   help="remove even if the entry has attributed eToro lots")
    p.set_defaults(func=app.cmd_remove)

    p = sub.add_parser(
        "prune-text",
        help="strip reason, risk, and notes from all sold or blacklisted positions")
    p.set_defaults(func=app.cmd_prune_text)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
