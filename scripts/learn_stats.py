#!/usr/bin/env python3
"""Outcome stats for the advice tracker. Read-only, used by /learn.

Usage:
  python3 scripts/learn_stats.py               # human-readable bucket tables
  python3 scripts/learn_stats.py --json        # machine output
  python3 scripts/learn_stats.py --count-only  # just the measurable-outcome count

Import-source entries are excluded: they're holdings, not advice, so they say
nothing about advice quality.

An outcome is "measurable" when the advice had time to play out: sold and
dropped entries always, bought entries once the advice is 7+ days old.
Watching entries are shown but never measurable.
"""
import argparse
import json
import os
import statistics
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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

is_demo = get_env("DEMO_MODE") == "1"
subdir = "sample" if is_demo else "private"
LOG_FILE = os.path.join(ROOT, "data", subdir, "advice-log.json")
OUT_FILE = os.path.join(ROOT, "data", subdir, "learn-stats.json")

RSI_BANDS = (("<20", 0, 20), ("20-25", 20, 25), ("25-30", 25, 30), ("30+", 30, 10 ** 6))
MIN_BUCKET = 1


def parse_date(s):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def latest_price(e):
    hist = e.get("priceHistory") or []
    return hist[-1]["price"] if hist else None


def outcome(e, today):
    """Return (kind, pct_change, measurable) for one advised entry."""
    latest = latest_price(e)
    status = e["status"]
    if status == "sold" and e.get("boughtAt") and e.get("soldAt"):
        return "realized", (e["soldAt"] - e["boughtAt"]) / e["boughtAt"] * 100, True
    if status == "bought" and e.get("boughtAt") and latest is not None:
        age = (today - parse_date(e["firstAdvised"])).days
        return "unrealized", (latest - e["boughtAt"]) / e["boughtAt"] * 100, age >= 7
    if status == "dropped" and e.get("priceAtAdvice") and latest is not None:
        # negative pct after a drop means dropping was right
        return "post-drop", (latest - e["priceAtAdvice"]) / e["priceAtAdvice"] * 100, True
    if status == "watching" and e.get("priceAtAdvice") and latest is not None:
        return "watching", (latest - e["priceAtAdvice"]) / e["priceAtAdvice"] * 100, False
    return None, None, False


def rsi_band(rsi):
    if rsi is None:
        return None
    for label, lo, hi in RSI_BANDS:
        if lo <= rsi < hi:
            return label
    return None


def seven_day_pct(e):
    """% change ~7 days after advice, from the nearest priceHistory point (tolerance 3 days)."""
    base = e.get("priceAtAdvice")
    hist = e.get("priceHistory") or []
    if not base or not hist:
        return None
    target = parse_date(e["firstAdvised"]) + timedelta(days=7)
    best, best_off = None, 99
    for point in hist:
        off = abs((parse_date(point["date"]) - target).days)
        if off < best_off:
            best, best_off = point, off
    if best is None or best_off > 3:
        return None
    return (best["price"] - base) / base * 100


def bucket_stats(rows):
    """rows = [(bucket_key, pct)] -> {bucket: {n, winRate, avg, median} | insufficient}"""
    grouped = {}
    for key, pct in rows:
        grouped.setdefault(key, []).append(pct)
    out = {}
    for key, pcts in sorted(grouped.items(), key=lambda kv: str(kv[0])):
        if len(pcts) < MIN_BUCKET:
            out[key] = {"n": len(pcts), "insufficient": True}
        else:
            out[key] = {
                "n": len(pcts),
                "winRate": round(100 * sum(1 for p in pcts if p > 0) / len(pcts), 1),
                "avg": round(statistics.mean(pcts), 2),
                "median": round(statistics.median(pcts), 2),
            }
    return out


def collect():
    with open(LOG_FILE) as f:
        data = json.load(f)
    today = date.today()
    advised = [e for e in data["entries"] if e.get("source") != "import"]

    measurable = []
    all_outcomes = []
    for e in advised:
        kind, pct, ok = outcome(e, today)
        if kind is None:
            continue
        all_outcomes.append((e, kind, pct, ok))
        if ok:
            measurable.append((e, pct))

    dims = {
        "rating": lambda e: e.get("rating"),
        "ratingLetter": lambda e: (e.get("rating") or "")[:1] or None,
        "rsiBand": lambda e: rsi_band(e.get("rsiAtAdvice")),
        "sector": lambda e: e.get("sector"),
        "source": lambda e: e.get("source"),
        "status": lambda e: e.get("status"),
    }
    buckets = {
        name: bucket_stats([(key(e), pct) for e, pct in measurable if key(e) is not None])
        for name, key in dims.items()
    }

    seven = [p for p in (seven_day_pct(e) for e in advised) if p is not None]
    return {
        "advisedEntries": len(advised),
        "measurableOutcomes": len(measurable),
        "watchingNow": sum(1 for e, k, _, _ in all_outcomes if k == "watching"),
        "buckets": buckets,
        "sevenDayAfterAdvice": {
            "n": len(seven),
            "avg": round(statistics.mean(seven), 2) if seven else None,
            "median": round(statistics.median(seven), 2) if seven else None,
        },
    }


def print_human(stats):
    print(f"Advised entries: {stats['advisedEntries']} "
          f"(measurable outcomes: {stats['measurableOutcomes']}, "
          f"watching: {stats['watchingNow']})")
    sd = stats["sevenDayAfterAdvice"]
    if sd["n"]:
        print(f"~7 days after advice: avg {sd['avg']:+.2f}%, median {sd['median']:+.2f}% (n={sd['n']})")
    for name, buckets in stats["buckets"].items():
        if not buckets:
            continue
        print(f"\nBy {name}:")
        for key, s in buckets.items():
            if s.get("insufficient"):
                print(f"  {key:16} n={s['n']}  insufficient data")
            else:
                print(f"  {key:16} n={s['n']:<3} win {s['winRate']:5.1f}%  "
                      f"avg {s['avg']:+7.2f}%  median {s['median']:+7.2f}%")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--count-only", action="store_true")
    args = parser.parse_args()
    stats = collect()
    if args.count_only:
        print(stats["measurableOutcomes"])
    elif args.json:
        print(json.dumps(stats, indent=2))
    else:
        print_human(stats)


if __name__ == "__main__":
    main()
