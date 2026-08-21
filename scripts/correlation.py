#!/usr/bin/env python3
import json
import urllib.request
import os
import math
import concurrent.futures

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def fetch_prices(ticker):
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1mo"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode())
            result = data['chart']['result'][0]
            close = result['indicators']['quote'][0]['close']
            return ticker, [p for p in close if p is not None]
    except Exception as e:
        return ticker, []

def pearson_corr(x, y):
    n = min(len(x), len(y))
    if n < 5:
        return 0.0
    x, y = x[-n:], y[-n:]
    sum_x, sum_y = sum(x), sum(y)
    sum_x2 = sum(xi*xi for xi in x)
    sum_y2 = sum(yi*yi for yi in y)
    sum_xy = sum(xi*yi for xi, yi in zip(x, y))
    
    num = n * sum_xy - sum_x * sum_y
    den = math.sqrt((n * sum_x2 - sum_x**2) * (n * sum_y2 - sum_y**2))
    return num / den if den != 0 else 0.0

def main():
    try:
        with open(os.path.join(ROOT, "data", "private", "portfolio.json"), encoding="utf-8") as f:
            port = json.load(f)
            tickers = [h['ticker'] for h in port.get('holdings', [])]
    except Exception:
        tickers = []
    
    if not tickers:
        print(json.dumps({"error": "No holdings found"}))
        return

    prices = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        for t, p in executor.map(fetch_prices, tickers):
            if p:
                prices[t] = p

    valid_tickers = sorted(list(prices.keys()))
    matrix = []
    for i, t1 in enumerate(valid_tickers):
        row = []
        for j, t2 in enumerate(valid_tickers):
            if i == j:
                row.append(1.0)
            else:
                row.append(round(pearson_corr(prices[t1], prices[t2]), 2))
        matrix.append(row)
    
    out = {"tickers": valid_tickers, "matrix": matrix}
    out_path = os.path.join(ROOT, "data", "private", "correlation.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f)
    
    print(json.dumps(out))

if __name__ == "__main__":
    main()
