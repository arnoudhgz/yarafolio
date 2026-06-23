#!/usr/bin/env python3
"""Market data scraper for the advice workflow. Read-only, stdlib only.

Usage:
  python3 scripts/screen.py oversold [--min-price 20] [--max 25] [--full]
  python3 scripts/screen.py quote TICKER [TICKER ...] [--json]
  python3 scripts/screen.py forecast TICKER [TICKER ...]
  python3 scripts/screen.py news TICKER [TICKER ...] [--days 2] [--max 8] [--red-flags]

Scrapes stockanalysis.com's server-rendered pages (screen, quote, analyst
forecast) and Google News RSS (headlines, red-flag discovery). This replaces
the mechanical WebFetch/WebSearch steps in /advice, /premarket, /check,
/diversify and the stock-researcher agents; the judgment work (reading the
articles that matter, weighing litigation severity) stays with the agent.

Brittleness warning: this parses unofficial page markup. When a command
prints nothing or errors, the markup probably changed: fall back to
WebFetch/WebSearch in the skill and mention the breakage so the script gets fixed.
"""
import argparse
import html as htmllib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import logging
import os
import concurrent.futures
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
logger = logging.getLogger("screen")
logger.setLevel(logging.INFO)
logger.handlers = []

fh = logging.FileHandler(os.path.join(ROOT, "logs", "app.log"))
fh.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(fh)

ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter('%(message)s'))
logger.addHandler(ch)

BASE = "https://stockanalysis.com"
QUOTE_FIELDS = (
    "Market Cap",
    "PE Ratio",
    "Forward PE",
    "Dividend Yield",
    "52-Week Range",
    "Day's Range",
    "Previous Close",
    "Beta",
    "Volume",
    "Average Volume",
    "Earnings Date",
    "Analysts",
    "Price Target")
RED_FLAG_TERMS = "lawsuit OR investigation OR fraud OR SEC OR \"class action\" OR bankruptcy OR \"chapter 11\" OR default"


def quote_session_note(data):
    """Human-readable session tag for a parsed quote.

    Returns '' for a regular-session quote, otherwise something like
    'pre-market, as of Jun 15, 2026, 4:05 AM EDT' so a researcher reading the
    embedded quote row knows which session the price belongs to.
    """
    session = data.get("session", "regular")
    if session == "regular":
        return ""
    note = session
    if data.get("asOf"):
        note += f", as of {data['asOf']}"
    return note


class Screen:
    def fetch(self, path_or_url, retries=2):
        url = path_or_url if path_or_url.startswith(
            "http") else BASE + path_or_url
        req = urllib.request.Request(url, headers={
            "User-Agent": "curl/8.7.1",
            "Accept": "text/html, application/rss+xml",
        })
        for attempt in range(retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=30) as res:
                    return res.read().decode("utf-8", "replace")
            except urllib.error.HTTPError as exc:
                if exc.code != 429 and exc.code < 500:
                    # 404 (stocks->etf fallthrough) and other client errors:
                    # don't retry
                    raise
                if attempt == retries:
                    raise
            except (urllib.error.URLError, TimeoutError):
                if attempt == retries:
                    raise
            time.sleep(attempt + 1)  # 1s, then 2s

    def fetch_symbol(self, ticker, suffix=""):
        """Stocks live under /stocks/, ETFs under /etf/. Try both."""
        try:
            return self.fetch(f"/stocks/{ticker.lower()}/{suffix}")
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            return self.fetch(f"/etf/{ticker.lower()}/{suffix}")

    def strip_tags(self, fragment):
        return re.sub(r"<[^>]+>", "", fragment).strip()

    def parse_table(self, html):
        """Parse the first data table: returns (headers, rows of cell text)."""
        html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
        headers = [
            self.strip_tags(h) for h in re.findall(
                r"<th[^>]*>(.*?)</th>", html, re.S)]
        rows = []
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
            cells = [
                self.strip_tags(c) for c in re.findall(
                    r"<td[^>]*>(.*?)</td>", row, re.S)]
            if cells:
                rows.append(cells)
        return headers, rows

    def to_float(self, text):
        try:
            return float(text.replace(",", "").replace("%", ""))
        except (ValueError, AttributeError):
            return None

    def last_int(self, label_pattern, text):
        """Last integer in the run that follows label_pattern (newest month in a trend row)."""
        m = re.search(label_pattern + r"((?:\s+\d+)+)", text)
        return m.group(1).split()[-1] if m else None

    def cmd_oversold(self, args):
        headers, rows = self.parse_table(self.fetch("/list/oversold-stocks/"))
        if not rows:
            logger.warning(
                "oversold screen parsed 0 rows - stockanalysis.com markup likely "
                "changed; fall back to the WebFetch sources in the skill")
        cols = {name: idx for idx, name in enumerate(headers)}
        sym = next((cols[c] for c in cols if "Symbol" in c), 1)
        name = next((cols[c] for c in cols if "Name" in c), 2)
        rsi = next((cols[c] for c in cols if "RSI" in c), 3)
        price = next((cols[c] for c in cols if "Price" in c), 4)

        extra = [(label, next((cols[c] for c in cols if key in c), None)) for label, key in (
            ("PE", "PE"), ("VOL", "Volume"), ("MKTCAP", "Market Cap"), ("SECTOR", "Industry"))]
        extra = [(label, idx) for label, idx in extra if idx is not None]
        picked = []
        for cells in rows:
            if len(cells) <= max(sym, name, rsi, price):
                continue
            p = self.to_float(cells[price])
            if p is None or p < args.min_price:
                continue
            extras = [
                cells[idx] if idx < len(cells) else "" for _,
                idx in extra] if args.full else []
            picked.append(
                (self.to_float(
                    cells[rsi]) or 0.0,
                    cells[sym],
                    cells[name],
                    p,
                    extras))
        if not picked:
            sys.exit(
                "no rows parsed: stockanalysis markup may have changed, fall back to WebFetch")
        head = "TICKER | NAME | RSI | PRICE"
        if args.full and extra:
            head += " | " + " | ".join(label for label, _ in extra)
        logger.info(head)
        for r, s, n, p, extras in sorted(
                picked, key=lambda row: row[0])[
                :args.max]:
            line = f"{s} | {n} | {r} | {p}"
            if extras:
                line += " | " + " | ".join(extras)
            logger.info(line)

    def parse_quote(self, ticker):
        html_clean = re.sub(
            r"<!--.*?-->",
            "",
            self.fetch_symbol(ticker),
            flags=re.S)
        visible = htmllib.unescape(
            re.sub(
                r"\s+",
                " ",
                re.sub(
                    r"<[^>]+>",
                    " ",
                    html_clean)))
        m = re.search(r'class="text-4xl[^"]*">([0-9.,]+)', html_clean)
        pairs = dict(
            re.findall(
                r"<td[^>]*>([^<]{2,30})</td><td[^>]*>([^<]+)</td>",
                html_clean))
        regular_price = self.to_float(m.group(1)) if m else None
        data = {
            "price": regular_price,
            "regularPrice": regular_price,
            "session": "regular"}

        stamp = r"[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M [A-Z]{3,4}"
        labels = r"Pre-market|After-hours|Market open|At close|As of"
        events = [
            (m.group(2),
             m.group(1)) for m in re.finditer(
                rf"({stamp})\s*[-–]\s*({labels})",
                visible)]
        events += [(m.group(1), m.group(2))
                   for m in re.finditer(rf"\b({labels}):\s*({stamp})", visible)]
        extended_session = {
            "Pre-market": "pre-market",
            "After-hours": "after-hours"}
        active = next((e for e in events if e[0] in extended_session),
                      events[0] if events else None)
        if active:
            label, ts = active
            session = extended_session.get(label, "regular")
            data["session"] = session
            data["asOf"] = ts
            if session != "regular":
                ext = re.search(
                    r'text-\[1\.7rem\][^>]*>([0-9.,]+)', html_clean)
                if ext:
                    data["price"] = self.to_float(ext.group(1))
            try:
                parsed = datetime.strptime(
                    ts.rsplit(" ", 1)[0], "%b %d, %Y, %I:%M %p")
                data["marketDate"] = parsed.date().isoformat()
            except ValueError:
                pass
        for label in QUOTE_FIELDS:
            if label in pairs:
                data[label] = pairs[label].strip()
        return data

    def cmd_quote(self, args):
        results = {}

        def fetch_wrapper(ticker):
            try:
                return ticker, self.parse_quote(ticker)
            except Exception as exc:
                return ticker, {"error": str(exc)}

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            futures = {
                executor.submit(
                    fetch_wrapper,
                    ticker): ticker for ticker in args.tickers}
            for future in concurrent.futures.as_completed(futures):
                ticker, data = future.result()
                results[ticker] = data

        if args.json:
            logger.info(json.dumps(results))
            return
        for ticker, data in results.items():
            if "error" in data:
                logger.info(f"{ticker}: fetch failed ({data['error']})")
                continue
            price = data.get("price")
            note = quote_session_note(data)
            price_label = f"price {price}" if price is not None else "price ?"
            if note:
                price_label += f" ({note})"
            stats = [price_label]
            regular_price = data.get("regularPrice")
            if note and regular_price is not None and regular_price != price:
                stats.append(f"regular close {regular_price}")
            stats += [f"{label} {data[label]}" for label in QUOTE_FIELDS if label in data]

            if price is not None and "52-Week Range" in data:
                try:
                    low_val = float(
                        data["52-Week Range"].split("-")[0].strip().replace(',', ''))
                    if low_val > 0:
                        stats.append(
                            f"% above 52W Low {((price - low_val) / low_val * 100):.1f}%")
                except Exception:
                    pass

            if "Earnings Date" in data and data["Earnings Date"] not in (
                    "", "-"):
                try:
                    edate = datetime.strptime(
                        data["Earnings Date"], "%b %d, %Y").date()
                    days_until = (edate - datetime.today().date()).days
                    if 0 <= days_until <= 7:
                        stats.append(
                            f"[⚠️ WARNING: EARNINGS IN {days_until} DAYS]")
                except Exception:
                    pass

            if "Volume" in data and "Average Volume" in data:
                try:
                    def parse_vol(v):
                        v = v.replace(',', '').upper()
                        if v.endswith('M'):
                            return float(v[:-1]) * 1e6
                        if v.endswith('B'):
                            return float(v[:-1]) * 1e9
                        if v.endswith('K'):
                            return float(v[:-1]) * 1e3
                        return float(v)
                    vol = parse_vol(data["Volume"])
                    avg_vol = parse_vol(data["Average Volume"])
                    if avg_vol > 0 and vol >= avg_vol * 3:
                        stats.append(
                            f"[🔥 CAPITULATION: Volume is {vol/avg_vol:.1f}x average]")
                except Exception:
                    pass

            logger.info(f"{ticker}: " + " | ".join(stats))

    def cmd_forecast(self, args):
        results = {}

        def fetch_wrapper(ticker):
            try:
                html = self.fetch_symbol(ticker, "forecast/")
                text = htmllib.unescape(
                    re.sub(
                        r"\s+",
                        " ",
                        re.sub(
                            r"<[^>]+>",
                            " ",
                            re.sub(
                                r"<!--.*?-->",
                                "",
                                html,
                                flags=re.S))))
                m = re.search(
                    r"According to (\d+) analysts.{0,120}?consensus rating of "
                    r"[\"“]?([A-Za-z ]+?)[\"”]? and an average price target "
                    r"of \$([0-9,]+(?:\.[0-9]+)?)", text)
                rng = re.search(r"lowest is \$([0-9,]+(?:\.[0-9]+)?)[^$]*?"
                                r"highest is \$([0-9,]+(?:\.[0-9]+)?)", text)
                dist = {
                    k: self.last_int(
                        pat,
                        text) for k,
                    pat in (
                        ("SB",
                         r"Strong Buy"),
                        ("B",
                         r"(?<!Strong )\bBuy"),
                        ("H",
                         r"\bHold"),
                        ("S",
                         r"(?<!Strong )\bSell"),
                        ("SS",
                         r"Strong Sell"))}
                asof = re.search(
                    r"Last [Uu]pdated[:,]?\s*([A-Z][a-z]{2,8} \d{1,2}, \d{4})", text)

                if not m:
                    return ticker, f"{ticker}: no forecast data (ETF or markup changed)"
                line = f"{ticker}: {m.group(1)} analysts | consensus {m.group(2)} | avg target ${m.group(3)}"
                if rng:
                    line += f" | low ${rng.group(1)} | high ${rng.group(2)}"
                if all(v is not None for v in dist.values()):
                    line += " | dist " + \
                        " ".join(f"{k}:{dist[k]}" for k in ("SB", "B", "H", "S", "SS"))
                if asof:
                    line += f" | as-of {asof.group(1)}"
                return ticker, line
            except Exception as exc:
                return ticker, f"{ticker}: fetch failed ({exc})"

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            futures = {
                executor.submit(
                    fetch_wrapper,
                    ticker): ticker for ticker in args.tickers}
            for future in concurrent.futures.as_completed(futures):
                ticker, data = future.result()
                results[ticker] = data

        for ticker in args.tickers:
            logger.info(results.get(ticker, f"{ticker}: not processed"))

    def cmd_news(self, args):
        results = {}

        def fetch_news(ticker):
            terms = f"{ticker} {RED_FLAG_TERMS}" if args.red_flags else f"{ticker} stock"
            query = urllib.parse.quote_plus(f"{terms} when:{args.days}d")
            try:
                xml = self.fetch(
                    f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en")
                items = re.findall(r"<item>(.*?)</item>", xml, re.S)
                lines = []
                if not items:
                    lines = []
                else:
                    for item in items[:args.max]:
                        title = re.search(r"<title>(.*?)</title>", item, re.S)
                        date = re.search(r"<pubDate>(\w+, \d+ \w+ \d+)", item)
                        source = re.search(
                            r"<source[^>]*>(.*?)</source>", item)
                        link = re.search(r"<link>(.*?)</link>", item, re.S)
                        if getattr(args, 'json', False):
                            lines.append({
                                "date": date.group(1) if date else '?',
                                "source": source.group(1) if source else '?',
                                "title": htmllib.unescape(title.group(1)).strip() if title else '?',
                                "link": link.group(1).strip() if link else '?'
                            })
                        else:
                            lines.append(
                                f"  - {date.group(1) if date else '?'} | "
                                f"{source.group(1) if source else '?'} | "
                                f"{htmllib.unescape(title.group(1)).strip() if title else '?'} | "
                                f"{link.group(1).strip() if link else '?'}")
                return ticker, lines
            except Exception as exc:
                return ticker, [f"  fetch failed ({exc})"]

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            futures = {
                executor.submit(
                    fetch_news,
                    ticker): ticker for ticker in args.tickers}
            for future in concurrent.futures.as_completed(futures):
                ticker, data = future.result()
                results[ticker] = data

        if getattr(args, 'json', False):
            logger.info(json.dumps(results))
            return

        label = "red-flag headlines" if args.red_flags else "headlines"
        for ticker in args.tickers:
            logger.info(f"{ticker} ({label}, last {args.days}d):")
            news_lines = results.get(ticker, [])
            if not news_lines:
                logger.info("  none found")
            else:
                for line in news_lines:
                    logger.info(line)

    def cmd_ipos(self, args):
        cutoff = datetime.today().date() - timedelta(days=60)

        recent_headers, recent_rows = [], []
        try:
            recent_headers, recent_rows = self.parse_table(
                self.fetch("/ipos/"))
        except BaseException:
            pass

        upcoming_headers, upcoming_rows = [], []
        try:
            upcoming_headers, upcoming_rows = self.parse_table(
                self.fetch("/ipos/calendar/"))
        except BaseException:
            pass

        out = {"recent": [], "upcoming": []}

        def etoro_likely(row, headers, is_upcoming):
            ds_idx = headers.index(
                "Deal Size") if "Deal Size" in headers else -1
            mc_idx = headers.index(
                "Market Cap") if "Market Cap" in headers else -1
            if is_upcoming and ds_idx >= 0 and ds_idx < len(row):
                ds = self.to_float(
                    row[ds_idx].replace(
                        'M', '').replace(
                        'B', ''))
                if ds and 'B' in row[ds_idx]:
                    return True
                if ds and 'M' in row[ds_idx] and ds >= 200:
                    return True
            if is_upcoming and mc_idx >= 0 and mc_idx < len(row):
                mc = self.to_float(
                    row[mc_idx].replace(
                        'M', '').replace(
                        'B', ''))
                if mc and 'B' in row[mc_idx]:
                    return True
            return False

        seen_tickers = set()
        if "IPO Date" in recent_headers:
            d_idx = recent_headers.index("IPO Date")
            sym_idx = recent_headers.index(
                "Symbol") if "Symbol" in recent_headers else 1
            name_idx = recent_headers.index(
                "Company Name") if "Company Name" in recent_headers else 2
            ret_idx = recent_headers.index(
                "Return") if "Return" in recent_headers else -1
            for row in recent_rows:
                if len(row) > d_idx:
                    try:
                        d = datetime.strptime(row[d_idx], "%b %d, %Y").date()
                        if d >= cutoff:
                            ticker = row[sym_idx] if len(
                                row) > sym_idx else "?"
                            if ticker not in seen_tickers:
                                seen_tickers.add(ticker)
                                out["recent"].append({
                                    "date": row[d_idx],
                                    "ticker": ticker,
                                    "name": row[name_idx] if len(row) > name_idx else "?",
                                    "return": row[ret_idx] if ret_idx >= 0 and len(row) > ret_idx else "?",
                                    "etoroLikely": True
                                })
                    except BaseException:
                        pass

        if "IPO Date" in upcoming_headers:
            d_idx = upcoming_headers.index("IPO Date")
            sym_idx = upcoming_headers.index(
                "Symbol") if "Symbol" in upcoming_headers else 1
            name_idx = upcoming_headers.index(
                "Company Name") if "Company Name" in upcoming_headers else 2
            for row in upcoming_rows:
                if len(row) > d_idx:
                    try:
                        d = datetime.strptime(row[d_idx], "%b %d, %Y").date()
                        if d >= datetime.today().date() - timedelta(days=1):
                            ticker = row[sym_idx] if len(
                                row) > sym_idx else "?"
                            if ticker not in seen_tickers:
                                seen_tickers.add(ticker)
                                out["upcoming"].append({
                                    "date": row[d_idx],
                                    "ticker": ticker,
                                    "name": row[name_idx] if len(row) > name_idx else "?",
                                    "etoroLikely": etoro_likely(row, upcoming_headers, True)
                                })
                    except BaseException:
                        pass

        if getattr(args, 'json', False):
            logger.info(json.dumps(out))
        else:
            logger.info("Recent (last 60 days): " + str(len(out["recent"])))
            logger.info("Upcoming: " + str(len(out["upcoming"])))


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    app = Screen()

    p = sub.add_parser(
        "oversold",
        help="oversold screen (RSI < 30), filtered candidates")
    p.add_argument("--min-price", type=float, default=20.0)
    p.add_argument("--max", type=int, default=25)
    p.add_argument(
        "--full",
        action="store_true",
        help="append PE/VOL/MKTCAP/SECTOR columns when the page exposes them")
    p.set_defaults(func=app.cmd_oversold)

    p = sub.add_parser("quote", help="price + key stats per ticker")
    p.add_argument("tickers", nargs="+")
    p.add_argument(
        "--json",
        action="store_true",
        help="emit {ticker: {price, ...}} JSON (used by yarafolio.py /api/refresh)")
    p.set_defaults(func=app.cmd_quote)

    p = sub.add_parser(
        "forecast",
        help="analyst consensus + price targets per ticker")
    p.add_argument("tickers", nargs="+")
    p.set_defaults(func=app.cmd_forecast)

    p = sub.add_parser(
        "news",
        help="recent headlines per ticker via Google News RSS")
    p.add_argument("tickers", nargs="+")
    p.add_argument("--days", type=int, default=2)
    p.add_argument("--max", type=int, default=8)
    p.add_argument("--red-flags", action="store_true",
                   help="search lawsuit/investigation/fraud/SEC terms instead")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=app.cmd_news)

    p = sub.add_parser("ipos", help="recent and upcoming IPOs")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=app.cmd_ipos)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
